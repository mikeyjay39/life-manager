use std::path::PathBuf;
use std::sync::OnceLock;

static GIT_COMMIT: OnceLock<String> = OnceLock::new();

// `CARGO_MANIFEST_DIR` is set by Cargo when compiling this crate (not at runtime).
// It is the directory containing this package's Cargo.toml (`backend/` locally, `/app`
// in the Docker builder). `env!` bakes that path into the binary, so we look for
// `rev.txt` next to the crate root that was built—not from a runtime environment variable.
fn rev_file_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("rev.txt")
}

fn load_git_commit_from_file() -> String {
    let path = rev_file_path();
    match std::fs::read_to_string(&path) {
        Ok(contents) => {
            let commit = contents.trim();
            if commit.is_empty() {
                tracing::warn!(path = %path.display(), "rev.txt is empty");
                "unknown".to_string()
            } else {
                tracing::info!(path = %path.display(), commit, "Loaded build revision");
                commit.to_string()
            }
        }
        Err(err) => {
            tracing::warn!(
                path = %path.display(),
                error = %err,
                "Could not read rev.txt"
            );
            "unknown".to_string()
        }
    }
}

/// Git commit SHA from `rev.txt` (written by `scripts/write_rev.sh` at build/deploy time).
pub fn git_commit() -> &'static str {
    GIT_COMMIT.get_or_init(load_git_commit_from_file)
}

/// Load revision from disk once at startup so missing `rev.txt` is logged early.
pub fn init() {
    let _ = git_commit();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn rev_file_path_is_under_manifest_dir() {
        let path = rev_file_path();
        assert!(path.ends_with("rev.txt"));
    }

    #[test]
    fn load_git_commit_reads_trimmed_rev_file() {
        let _guard = TEST_LOCK.lock().unwrap();
        let path = rev_file_path();
        let prior = fs::read_to_string(&path).ok();
        fs::write(&path, "abc123def456\n\n").unwrap();
        assert_eq!(load_git_commit_from_file(), "abc123def456");
        restore_rev_file(&path, prior);
    }

    #[test]
    fn load_git_commit_returns_unknown_when_rev_file_missing() {
        let _guard = TEST_LOCK.lock().unwrap();
        let path = rev_file_path();
        let prior = fs::read_to_string(&path).ok();
        let backup = path.with_extension("txt.bak");
        if path.exists() {
            fs::rename(&path, &backup).unwrap();
        }
        assert_eq!(load_git_commit_from_file(), "unknown");
        if backup.exists() {
            fs::rename(&backup, &path).unwrap();
        }
        restore_rev_file(&path, prior);
    }

    fn restore_rev_file(path: &std::path::Path, prior: Option<String>) {
        match prior {
            Some(contents) => {
                fs::write(path, contents).unwrap();
            }
            None => {
                let _ = fs::remove_file(path);
            }
        }
    }
}
