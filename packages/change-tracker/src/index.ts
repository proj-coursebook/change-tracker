import { createHash } from "crypto";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { dirname } from "path";
import { LogManagerImpl, type Logger } from "@coursebook/simple-logger";
import {
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
} from "./types";

/**
 * Implementation of the change tracker component
 */
class ChangeTrackerImpl<T extends HasContents> implements ChangeTracker<T> {
  private fileStates: FileStates = new Map();
  private logger: Logger;

  constructor(private config: ChangeTrackerConfig) {
    this.logger = LogManagerImpl.getInstance().getLogger("change-tracker");
    this.config.enabled = this.config.enabled ?? true;
  }

  /**
   * Creates an MD5 hash of file contents
   */
  private createFingerprint(file: { contents: Buffer }): string {
    return createHash("md5").update(file.contents).digest("hex");
  }

  /**
   * Load previous fingerprints from history file
   */
  private async loadHistory(): Promise<FileFingerprints> {
    this.logger.trace("Loading change history");
    if (!this.config.historyPath) {
      this.logger.error("History path not set");
      throw new ChangeTrackerError(
        ChangeTrackerErrorType.HISTORY_PATH_NOT_SET,
        "History path must be set to track changes",
      );
    }

    try {
      const content = await readFile(this.config.historyPath, "utf8");
      const history = JSON.parse(content);
      this.logger.trace("Loaded change history:", history);
      return history;
    } catch (err) {
      this.logger.trace("No previous change history found:", err);
      return {};
    }
  }

  /**
   * Save current fingerprints to history file
   */
  private async saveHistory(fingerprints: FileFingerprints): Promise<void> {
    this.logger.trace("Saving change history");
    if (!this.config.historyPath) {
      this.logger.error("History path not set");
      throw new ChangeTrackerError(
        ChangeTrackerErrorType.HISTORY_PATH_NOT_SET,
        "History path must be set to track changes",
      );
    }

    try {
      await mkdir(dirname(this.config.historyPath), { recursive: true });
      await writeFile(
        this.config.historyPath,
        JSON.stringify(fingerprints, null, 2),
      );
      this.logger.trace("Change history saved");
    } catch (err) {
      this.logger.error("Failed to save change history:", err);
      throw new ChangeTrackerError(
        ChangeTrackerErrorType.HISTORY_WRITE_ERROR,
        "Failed to save change history",
        err instanceof Error ? err : undefined,
      );
    }
  }

  async trackChanges(files: FileDataCollection<T>): Promise<FileStates> {
    this.logger.trace("Starting change tracking");

    if (!this.config.enabled) {
      this.logger.info(
        "Change tracking is disabled, marking files as untracked",
      );
      return new Map(
        Object.keys(files).map((filepath) => [
          filepath,
          { status: "untracked" as const, previousFingerprint: undefined },
        ]),
      );
    }

    // Load previous fingerprints
    const loadedHistory = await this.loadHistory();

    // Calculate new fingerprints
    this.logger.trace("Calculating new fingerprints");
    const newFingerprints = Object.entries(files).reduce(
      (acc, [filepath, file]) => {
        acc[filepath] = this.createFingerprint(file);
        return acc;
      },
      {} as FileFingerprints,
    );
    this.logger.trace("New fingerprints:", newFingerprints);

    // Clear states for deleted files
    const currentFiles = new Set(Object.keys(files));
    for (const [filepath] of this.fileStates) {
      if (!currentFiles.has(filepath)) {
        this.logger.trace("Removing state for deleted file:", filepath);
        this.fileStates.delete(filepath);
      }
    }

    // Update file states
    for (const [filepath, file] of Object.entries(files)) {
      const previousFingerprint = loadedHistory[filepath];
      const currentFingerprint = newFingerprints[filepath];
      const isNew = !previousFingerprint;

      this.logger.trace(
        "Processing file:",
        filepath,
        "previous:",
        previousFingerprint || "none",
        "current:",
        currentFingerprint,
        "isNew:",
        isNew,
      );

      const state: FileChangeState = {
        status: isNew
          ? "new"
          : previousFingerprint !== currentFingerprint
            ? "modified"
            : "unchanged",
        previousFingerprint: isNew ? undefined : previousFingerprint,
      };

      this.logger.trace("Setting state for file:", filepath, state);
      this.fileStates.set(filepath, state);
    }

    // Save new fingerprints
    await this.saveHistory(newFingerprints);

    this.logger.info("Change tracking completed");
    return this.fileStates;
  }

  getFileState(filepath: string): FileChangeState | undefined {
    return this.fileStates.get(filepath);
  }

  async clearHistory(): Promise<void> {
    this.logger.trace("Clearing change history");
    if (!this.config.historyPath) {
      this.logger.error("History path not set");
      throw new ChangeTrackerError(
        ChangeTrackerErrorType.HISTORY_PATH_NOT_SET,
        "History path must be set to clear history",
      );
    }

    try {
      await rm(this.config.historyPath, { force: true });
      this.fileStates.clear();
      this.logger.info("Change history cleared");
    } catch (err) {
      this.logger.error("Failed to clear change history:", err);
      throw new ChangeTrackerError(
        ChangeTrackerErrorType.HISTORY_WRITE_ERROR,
        "Failed to clear change history",
        err instanceof Error ? err : undefined,
      );
    }
  }

  enable(options: boolean | ChangeTrackerConfig): void {
    this.logger.trace("Updating change tracker configuration");

    if (typeof options === "boolean") {
      this.config.enabled = options;
    } else {
      this.config = { ...this.config, ...options };
    }

    this.logger.info(
      `Change tracking ${this.config.enabled ? "enabled" : "disabled"}`,
    );
  }
}

// Export types
export type {
  ChangeTracker,
  ChangeTrackerConfig,
  FileChangeState,
  FileChangeStatus,
  FileDataCollection,
  FileFingerprints,
  FileStates,
};

// Export implementation
export { ChangeTrackerError, ChangeTrackerErrorType, ChangeTrackerImpl };
