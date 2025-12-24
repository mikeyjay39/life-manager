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
