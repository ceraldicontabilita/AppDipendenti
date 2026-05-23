"""
Custom exceptions package.
"""
from backend.app.exceptions.custom_exceptions import (
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    DuplicateError,
    DatabaseError,
    FileProcessingError,
    ExternalServiceError,
    BusinessLogicError,
    TransactionError,
    RateLimitError,
    ConfigurationError,
    validate_required_fields,
    validate_date_format,
    validate_numeric_range
)

__all__ = [
    "AppError",
    "ValidationError",
    "AuthenticationError",
    "AuthorizationError",
    "NotFoundError",
    "DuplicateError",
    "DatabaseError",
    "FileProcessingError",
    "ExternalServiceError",
    "BusinessLogicError",
    "TransactionError",
    "RateLimitError",
    "ConfigurationError",
    "validate_required_fields",
    "validate_date_format",
    "validate_numeric_range"
]
