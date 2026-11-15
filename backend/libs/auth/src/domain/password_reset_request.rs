use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/auth/PasswordResetRequestRequest.ts"
)]
pub struct PasswordResetRequestRequest {
    pub email: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/auth/PasswordResetRequestResponse.ts"
)]
pub struct PasswordResetRequestResponse {
    pub message: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/auth/PasswordResetConfirmRequest.ts"
)]
pub struct PasswordResetConfirmRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(
    export,
    export_to = "../../../../frontend/lib/api/generated/auth/PasswordResetConfirmResponse.ts"
)]
pub struct PasswordResetConfirmResponse {
    pub message: String,
}

#[cfg(test)]
mod export_ts_bindings {
    use super::*;

    #[test]
    fn export_typescript_bindings() {
        PasswordResetRequestRequest::export().unwrap();
        PasswordResetRequestResponse::export().unwrap();
        PasswordResetConfirmRequest::export().unwrap();
        PasswordResetConfirmResponse::export().unwrap();
    }
}
