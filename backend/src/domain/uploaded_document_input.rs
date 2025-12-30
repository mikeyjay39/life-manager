/**
* Structure representing an uploaded document input.
*/
pub struct UploadedDocumentInput {
    /** Name of the uploaded file. */
    pub file_name: String,
    /** Raw binary data of the uploaded file. */
    pub file_data: Vec<u8>,
    pub extension: String,
}

impl UploadedDocumentInput {
    /**
     * Creates a new `UploadedDocumentInput`.
     *
     * # Arguments
     *
     * * `file_name` - The name of the uploaded file.
     * * `file_data` - The raw binary data of the uploaded file.
     *
     * # Returns
     *
     * A new instance of `UploadedDocumentInput`.
     */
    pub fn new(file_name: String, file_data: Vec<u8>) -> Self {
        let extension = file_name.rsplit('.').next().unwrap_or("").to_lowercase();
        UploadedDocumentInput {
            file_name,
            file_data,
            extension,
        }
    }

    pub fn is_pdf(&self) -> bool {
        self.file_name.to_lowercase().ends_with(".pdf")
    }
}

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::io::Read;
    use std::path::PathBuf;

    use super::UploadedDocumentInput;

    #[test]
    pub fn test_new() {
        let file_name = "hello_world.png";
        let path = PathBuf::from(format!("tests/resources/{}", file_name));
        let mut file = File::open(path).expect("Failed to open the file");
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .expect("Failed to read the file");
        let buffer_length = buffer.len();
        let uploaded_document_input = UploadedDocumentInput::new(file_name.to_string(), buffer);
        assert_eq!(uploaded_document_input.extension, "png");
        assert_eq!(uploaded_document_input.file_name, file_name);
        assert_eq!(uploaded_document_input.file_data.len(), buffer_length);
    }
}
