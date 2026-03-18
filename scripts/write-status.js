const fs = require('fs');
const path = require('path');

const STATUS_DIR = path.join(__dirname, '../site/data');

function writeStatus(connector, status, extra = {}) {
  fs.mkdirSync(STATUS_DIR, { recursive: true });

  const statusData = {
    status,
    last_fetch: new Date().toISOString(),
    ...extra
  };

  const filePath = path.join(STATUS_DIR, `status-${connector}.json`);
  fs.writeFileSync(filePath, JSON.stringify(statusData, null, 2));

  console.log(`[${connector}] Status written: ${status}`);
}

module.exports = { writeStatus };
