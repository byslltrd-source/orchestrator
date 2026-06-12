export class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: string = 'ORCHESTRATOR_ERROR',
    public status: number = 500
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

export class ValidationError extends OrchestratorError {
  constructor(message: string, public issues?: any) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class QuotaError extends OrchestratorError {
  constructor(message: string = 'Monthly limit reached') {
    super(message, 'QUOTA_EXCEEDED', 402);
    this.name = 'QuotaError';
  }
}

export class StorageError extends OrchestratorError {
  constructor(message: string) {
    super(message, 'STORAGE_ERROR', 500);
    this.name = 'StorageError';
  }
}
