declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TED_IMPORT_SECRET?: string;
  }
}
