
import { Jimp } from "jimp";
import fs from 'fs';

async function test() {
    console.log("Jimp imported:", Jimp);

    // Create a dummy image buffer (red pixel)
    // BMP header for 1x1 red pixel
    const buffer = Buffer.from([
        0x42, 0x4D, 0x3A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00, 0x00, 0x00,
        0x28, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00,
        0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0x00, 0x00, 0x00
    ]);
    const testPath = "test_img.bmp";
    fs.writeFileSync(testPath, buffer);

    try {
        console.log("Reading image...");
        const image = await Jimp.read(testPath);
        console.log("Image read success. Width:", image.bitmap.width, "Height:", image.bitmap.height);

        console.log("Attempting resize(10, 10)...");
        image.resize({ w: 10, h: 10 }); // Testing object syntax first as v1 might need it
        console.log("Resize {w,h} success.");

        console.log("Attempting resize(10, 10) args...");
        image.resize(10, 10);
        console.log("Resize (w,h) success.");

        console.log("Attempting constructor new Jimp({w:10, h:10})...");
        const newImgObj = new Jimp({ width: 10, height: 10 });
        console.log("Constructor {w,h} success.");

        console.log("Attempting constructor new Jimp(10, 10)...");
        const newImgArgs = new Jimp(10, 10);
        console.log("Constructor (w,h) success.");

    } catch (e) {
        console.error("Test Failed:", e);
    }
}

test();
