
import * as JimpPackage from "jimp";

console.log("Keys:", Object.keys(JimpPackage));
if (JimpPackage.Jimp) {
    console.log("Jimp Static Keys:", Object.keys(JimpPackage.Jimp));
}
