import fs from "fs";
import path from "path";

export const DOWNLOAD_PATH = "./data";

export const getDataFromFile = relativepath => {
  return require(`../../${DOWNLOAD_PATH}/${relativepath}`);
};
export const getContentsFromFile = relativepath => {
  const contents = fs.readFileSync(`${DOWNLOAD_PATH}/${relativepath}`, "utf8");
  return contents;
};

export const persistData = (relativepath, filename, data) => {
  const path = `${DOWNLOAD_PATH}/${relativepath}`;
  createDirRecursively(path);

  const destinationPath = `${path}/${filename}`;
  fs.writeFileSync(destinationPath, JSON.stringify(data, null, 2));
  return destinationPath;
};

export const persistContent = (relativepath, filename, data) => {
  const path = `${DOWNLOAD_PATH}/${relativepath}`;
  createDirRecursively(path);

  const destinationPath = `${path}/${filename}`;
  fs.writeFileSync(destinationPath, data);
  return destinationPath;
};

export const appendContent = (relativepath, filename, data) => {
  const path = `${DOWNLOAD_PATH}/${relativepath}`;
  createDirRecursively(path);

  const destinationPath = `${path}/${filename}`;
  fs.appendFileSync(destinationPath, data);
  return destinationPath;
};

export const getContentFromFileInFolder = relativepath => {
  const dirname = `${DOWNLOAD_PATH}/${relativepath}`;
  const files = getFilesFromFolder(dirname);
  if (!files.length) {
    throw new Error(`No hay archivos en la carpeta ${dirname}`);
  }
  const csv = fs.readFileSync(`${dirname}/${files[0]}`, "utf8");
  return csv;
};

export const getResolutionFilesInFolder = relativepath => {
  const dirname = `${DOWNLOAD_PATH}/${relativepath}`;
  const files = getFilesFromFolder(dirname);
  if (!files.length) {
    throw new Error(`No hay archivos en la carpeta ${dirname}`);
  }
  return files.filter(file => file.indexOf("resolutions-") > -1);
};

export const dirExistsSync = dir => fs.existsSync(dir);

export const createDirRecursively = dir => {
  if (!dirExistsSync(dir)) {
    createDirRecursively(path.join(dir, ".."));
    fs.mkdirSync(dir);
  }
};

export const getFilesFromFolder = dirpath => {
  if (!dirExistsSync(dirpath)) {
    return [];
  }
  return fs.readdirSync(dirpath).filter(filename => filename !== ".DS_Store");
};
