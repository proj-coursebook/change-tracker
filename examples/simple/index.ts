import {
  ChangeTrackerImpl,
  type FileDataCollection,
} from "@coursebook/change-tracker";

// Define a type for test file data
type TestFileData = { contents: Buffer };

// Create change tracker instance
const changeTracker = new ChangeTrackerImpl<TestFileData>({
  historyPath: "./example-history.json",
});

// Track changes in files
// You can change the files object to simulate changes and rerun this script
const files: FileDataCollection<TestFileData> = {
  "example.txt": {
    contents: Buffer.from("file content!"),
  },
};

const states = await changeTracker.trackChanges(files);

// Get state of a specific file
const state = changeTracker.getFileState("example.txt");
console.log(state?.status); // 'new', 'modified', or 'unchanged'
