// Test electron module resolution
const electronPath = require("electron");
console.log("require(electron) returns:", typeof electronPath, electronPath);
console.log("Is it the npm package?", typeof electronPath === "string" ? "YES - path: " + electronPath : "NO - module object");
