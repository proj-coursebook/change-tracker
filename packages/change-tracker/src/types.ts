/**
 * Collection of files, keyed by relative path
 *
 * @template T - The type of the file data
 */
interface HasContents {
  contents: Buffer;
}

type FileDataCollection<T extends HasContents> = Record<string, T>;

/**
 * Configuration options for change tracking
 */
interface ChangeTrackerConfig {
  /**
   * Path to store the change history file
   */
  historyPath: string;

  /**
   * Enable or disable change tracking
   * When disabled, all files will be treated as unchanged
   * @default true
   */
  enabled?: boolean;
}

/**
 * Status of a file's changes
 */
type FileChangeStatus = "new" | "modified" | "unchanged" | "untracked";

/**
 * State of a file's changes
 */
interface FileChangeState {
  /**
   * Current status of the file
   */
  status: FileChangeStatus;

  /**
   * Previous MD5 hash of the file, if any
   */
  previousFingerprint?: string;
}

/**
 * Map of file paths to their fingerprints
 */
type FileFingerprints = Record<string, string>;

/**
 * Map of file paths to their change states
 */
type FileStates = Map<string, FileChangeState>;

/**
 * Error types specific to change tracker
 */
enum ChangeTrackerErrorType {
  HISTORY_PATH_NOT_SET = "HISTORY_PATH_NOT_SET",
  HISTORY_READ_ERROR = "HISTORY_READ_ERROR",
  HISTORY_WRITE_ERROR = "HISTORY_WRITE_ERROR",
}

/**
 * Custom error class for change tracker errors
 */
class ChangeTrackerError extends Error {
  constructor(
    public type: ChangeTrackerErrorType,
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = "ChangeTrackerError";
  }
}

/**
 * Interface for the change tracker component
 *
 * @template T - The type of the file data
 */
interface ChangeTracker<T extends HasContents> {
  /**
   * Track changes in files
   * @param files Files to track changes for
   * @returns Map of file paths to their change states
   */
  trackChanges(files: FileDataCollection<T>): Promise<FileStates>;

  /**
   * Get the change state of a file
   * @param filepath Path of the file
   * @returns Change state of the file, or undefined if not tracked
   */
  getFileState(filepath: string): FileChangeState | undefined;

  /**
   * Clear change history
   * This will cause all files to be treated as new in the next build
   */
  clearHistory(): Promise<void>;

  /**
   * Enable or disable change tracking with optional configuration update
   * @param options Boolean to enable/disable tracking, or a complete configuration object
   */
  enable(options: boolean | ChangeTrackerConfig): void;
}

export {
  type ChangeTracker,
  type ChangeTrackerConfig,
  type FileChangeState,
  type FileChangeStatus,
  type FileDataCollection,
  type FileFingerprints,
  type FileStates,
  type HasContents,
  ChangeTrackerError,
  ChangeTrackerErrorType,
};
