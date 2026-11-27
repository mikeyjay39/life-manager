use std::io::Write;
use std::sync::{Arc, Mutex};

use tracing::subscriber::DefaultGuard;

/// Shared buffer for log lines from every crate. `traced_test` keeps only
/// the test crate's logs, and handler logs come from `life_manager`.
#[derive(Clone, Default)]
pub struct CapturedLogs(Arc<Mutex<Vec<u8>>>);

impl CapturedLogs {
    /// Installs a thread-local subscriber that writes events at `max_level`
    /// and above into this buffer. `#[tokio::test]` uses a current-thread
    /// runtime, so the test server task logs on this thread too.
    pub fn capture(&self, max_level: tracing::Level) -> DefaultGuard {
        let writer_logs = self.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_max_level(max_level)
            .with_ansi(false)
            .with_writer(move || writer_logs.clone())
            .finish();
        tracing::subscriber::set_default(subscriber)
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
    }

    pub fn contains(&self, text: &str) -> bool {
        self.text().contains(text)
    }
}

impl Write for CapturedLogs {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
