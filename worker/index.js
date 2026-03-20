export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    try {
      // GET /actions
      if (request.method === 'GET' && pathname === '/actions') {
        const { results } = await env.DB
          .prepare('SELECT * FROM cs_actions ORDER BY created_at DESC')
          .all();
        return json(results);
      }

      // POST /actions
      if (request.method === 'POST' && pathname === '/actions') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
        const { hubspot_id, name, priority } = body ?? {};
        if (!name || !priority) {
          return json({ error: 'Missing required fields: name, priority' }, 400);
        }
        if (!['high', 'med', 'low'].includes(priority)) {
          return json({ error: 'priority must be high, med, or low' }, 400);
        }
        const hid        = hubspot_id ? String(hubspot_id) : '';
        const id         = crypto.randomUUID();
        const created_at = new Date().toISOString();
        await env.DB
          .prepare('INSERT INTO cs_actions (id, hubspot_id, name, priority, done, created_at) VALUES (?, ?, ?, ?, 0, ?)')
          .bind(id, hid, String(name), priority, created_at)
          .run();
        return json({ id, hubspot_id: hid, name: String(name), priority, done: 0, created_at }, 201);
      }

      const idMatch = pathname.match(/^\/actions\/([^/]+)$/);

      // PATCH /actions/:id
      if (request.method === 'PATCH' && idMatch) {
        const id = idMatch[1];
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
        const sets = [];
        const vals = [];
        if ('name' in body) {
          if (typeof body.name !== 'string' || !body.name.trim()) return json({ error: 'name must be a non-empty string' }, 400);
          sets.push('name = ?'); vals.push(body.name.trim());
        }
        if ('priority' in body) {
          if (!['high', 'med', 'low'].includes(body.priority)) return json({ error: 'priority must be high, med, or low' }, 400);
          sets.push('priority = ?'); vals.push(body.priority);
        }
        if ('done' in body) {
          sets.push('done = ?'); vals.push(body.done ? 1 : 0);
        }
        if ('due_date' in body) {
          const d = body.due_date;
          if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            return json({ error: 'due_date must be YYYY-MM-DD or null' }, 400);
          }
          sets.push('due_date = ?'); vals.push(d ?? null);
        }
        if ('hubspot_id' in body) {
          sets.push('hubspot_id = ?'); vals.push(body.hubspot_id ? String(body.hubspot_id) : '');
        }
        vals.push(id);
        const updateResult = await env.DB
          .prepare(`UPDATE cs_actions SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...vals)
          .run();
        if (updateResult.meta.changes === 0) return json({ error: 'Not found' }, 404);
        const { results } = await env.DB
          .prepare('SELECT * FROM cs_actions WHERE id = ?')
          .bind(id)
          .all();
        return json(results[0]);
      }

      // DELETE /actions/:id
      if (request.method === 'DELETE' && idMatch) {
        const id = idMatch[1];
        const deleteResult = await env.DB
          .prepare('DELETE FROM cs_actions WHERE id = ?')
          .bind(id)
          .run();
        if (deleteResult.meta.changes === 0) return json({ error: 'Not found' }, 404);
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // GET /health
      if (request.method === 'GET' && pathname === '/health') {
        const { results } = await env.DB
          .prepare('SELECT hubspot_id, status FROM health ORDER BY hubspot_id')
          .all();
        return json(results);
      }

      // POST /health
      if (request.method === 'POST' && pathname === '/health') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
        const { hubspot_id, status } = body ?? {};
        if (!hubspot_id) return json({ error: 'Missing required field: hubspot_id' }, 400);
        const updated_at = new Date().toISOString();
        if (!status) {
          await env.DB.prepare('DELETE FROM health WHERE hubspot_id = ?').bind(String(hubspot_id)).run();
          return json({ hubspot_id: String(hubspot_id), status: null });
        }
        const validStatuses = ['risk', 'fair', 'good', 'excellent'];
        if (!validStatuses.includes(status)) {
          return json({ error: `status must be one of: ${validStatuses.join(', ')}` }, 400);
        }
        await env.DB
          .prepare('INSERT INTO health (hubspot_id, status, updated_at) VALUES (?, ?, ?) ON CONFLICT(hubspot_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at')
          .bind(String(hubspot_id), status, updated_at)
          .run();
        return json({ hubspot_id: String(hubspot_id), status });
      }

      // DELETE /health/:hubspot_id
      const healthIdMatch = pathname.match(/^\/health\/([^/]+)$/);
      if (request.method === 'DELETE' && healthIdMatch) {
        const hid = decodeURIComponent(healthIdMatch[1]);
        await env.DB.prepare('DELETE FROM health WHERE hubspot_id = ?').bind(hid).run();
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // POST /health/bulk
      if (request.method === 'POST' && pathname === '/health/bulk') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
        const updates = body?.updates;
        if (!Array.isArray(updates) || updates.length === 0) {
          return json({ error: 'updates must be a non-empty array' }, 400);
        }
        const validStatuses = ['risk', 'fair', 'good', 'excellent'];
        const updated_at = new Date().toISOString();
        const stmt = env.DB.prepare(
          'INSERT INTO health (hubspot_id, status, updated_at) VALUES (?, ?, ?) ON CONFLICT(hubspot_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at'
        );
        const validUpdates = updates.filter(u => u.hubspot_id && validStatuses.includes(u.status));
        await env.DB.batch(
          validUpdates.map(u => stmt.bind(String(u.hubspot_id), u.status, updated_at))
        );
        return json({ updated: validUpdates.length });
      }

      // GET /notes
      if (request.method === 'GET' && pathname === '/notes') {
        const { results } = await env.DB
          .prepare('SELECT hubspot_id, body FROM notes ORDER BY hubspot_id')
          .all();
        return json(results);
      }

      // POST /notes
      if (request.method === 'POST' && pathname === '/notes') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
        const { hubspot_id, notes } = body ?? {};
        if (!hubspot_id) return json({ error: 'Missing required field: hubspot_id' }, 400);
        if (typeof notes !== 'string') return json({ error: 'notes must be a string' }, 400);
        const updated_at = new Date().toISOString();
        await env.DB
          .prepare('INSERT INTO notes (hubspot_id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(hubspot_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at')
          .bind(String(hubspot_id), notes, updated_at)
          .run();
        return json({ hubspot_id: String(hubspot_id), body: notes });
      }

      // GET /settings — returns all settings as { key: value }
      if (request.method === 'GET' && pathname === '/settings') {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
        const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
        return json(Object.fromEntries(results.map(r => [r.key, r.value])));
      }

      // POST /settings — body: { key, value }
      if (request.method === 'POST' && pathname === '/settings') {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
        const { key, value } = body ?? {};
        if (!key || typeof key !== 'string') return json({ error: 'Missing required field: key' }, 400);
        if (typeof value !== 'string') return json({ error: 'value must be a string' }, 400);
        const updated_at = new Date().toISOString();
        await env.DB
          .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
          .bind(key, value, updated_at)
          .run();
        return json({ key, value });
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
