/**
* Structure representing an uploaded document input.
*/
pub struct UploadedDocumentInput {
    /** Name of the uploaded file. */
    pub file_name: String,
    /** Raw binary data of the uploaded file. */
    pub file_data: Vec<u8>,
}
