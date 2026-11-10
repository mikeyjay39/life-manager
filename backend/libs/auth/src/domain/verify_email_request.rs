use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/auth/VerifyEmailRequest.ts"
)]
pub struct VerifyEmailRequest {
    pub token: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/auth/VerifyEmailResponse.ts"
)]
pub struct VerifyEmailResponse {
    pub message: String,
}

#[cfg(test)]
mod export_ts_bindings {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        VerifyEmailRequest::export().unwrap();
        VerifyEmailResponse::export().unwrap();
    }
}
