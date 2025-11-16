use std::error::Error;

pub trait DocumentTextReader {
    fn read_image(&self, bytes: &[u8]) -> Result<String, Box<dyn Error>>;
}
