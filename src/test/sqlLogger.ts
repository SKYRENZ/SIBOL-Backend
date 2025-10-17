import fs from "fs";
import path from "path";

const ENABLE = process.env.MOCK_SQL_LOG === "true";
const LOG_DIR = path.resolve(process.cwd(), "test-logs");

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function createSqlLogger(testName = "test") {
  if (!ENABLE) {
    return {
      log: (_sql: string, _params?: any) => {},
      filePath: null as string | null,
    };
  }

  ensureDir();
  const filename = `${testName}.${process.pid}.${Date.now()}.log`;
  const filepath = path.join(LOG_DIR, filename);

  // Print the log directory exactly once across all Jest worker processes.
  // We create a lock file exclusively; the first process that creates it registers
  // an exit handler to print the directory. Other processes will fail creating
  // the lock and won't print.
  try {
    const lockPath = path.join(LOG_DIR, '.printed');
    const fd = fs.openSync(lockPath, 'wx');
    try {
      fs.writeSync(fd, String(process.pid));
    } finally {
      fs.closeSync(fd);
    }
    // register a one-time handler to print at process exit
    process.once('exit', () => {
      // eslint-disable-next-line no-console
      console.log('[MOCK SQL LOG DIRECTORY]:', LOG_DIR);
    });
  } catch (e) {
    // lock file already exists or write failed; do nothing so only one process prints
  }

  return {
    log(sql: string, params?: any) {
      try {
        const line = `${new Date().toISOString()} | ${String(sql).replace(/\s+/g, " ").trim()} | ${JSON.stringify(params)}\n`;
        fs.appendFileSync(filepath, line);
      } catch (e) {
        // keep tests unaffected if logging fails
        // eslint-disable-next-line no-console
        console.error("SQL Logger write error:", e);
      }
    },
    filePath: filepath,
  };
}