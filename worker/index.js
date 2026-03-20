export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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
        if (!hubspot_id || !name || !priority) {
          return json({ error: 'Missing required fields: hubspot_id, name, priority' }, 400);
        }
        if (!['high', 'med', 'low'].includes(priority)) {
          return json({ error: 'priority must be high, med, or low' }, 400);
        }
        const id         = crypto.randomUUID();
        const created_at = new Date().toISOString();
        await env.DB
          .prepare('INSERT INTO cs_actions (id, hubspot_id, name, priority, done, created_at) VALUES (?, ?, ?, ?, 0, ?)')
          .bind(id, String(hubspot_id), String(name), priority, created_at)
          .run();
        return json({ id, hubspot_id: String(hubspot_id), name: String(name), priority, done: 0, created_at }, 201);
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
if (sets.length === 0) return json({ error: 'No fields to update' }, 400);
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

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
