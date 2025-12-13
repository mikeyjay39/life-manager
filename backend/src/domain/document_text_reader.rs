use std::error::Error;

pub trait DocumentTextReader {
    fn read_image(&self, bytes: &[u8]) -> impl Future<Output = Result<String, Box<dyn Error>>>;
}
