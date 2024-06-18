import * as fs from "node:fs";
import * as path from "node:path";

function readDirRecursively(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      readDirRecursively(filePath, fileList);
    }
    else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function copyFile(srcPath: string, destPath: string): void {
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(srcPath, destPath);
}

function copyNonTsFiles(srcDir: string, destDir: string): void {
  const files = readDirRecursively(srcDir);
  files.forEach((file) => {
    if (path.extname(file) !== ".ts") {
      const relativePath = path.relative(srcDir, file);
      const destPath = path.join(destDir, relativePath);
      copyFile(file, destPath);
    }
  });
}

copyNonTsFiles("src", "dist");
