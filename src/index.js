const fs = require('fs');
const Jimp = require('jimp');
let {
    Bitmap,
    ImageRunner,
    ShapeTypes,
    ShapeJsonExporter
} = require('geometrizejs');

require('@g-js-api/g.js');

console.time('finished in');

let min_scale = 0.15; // smallest scaled objects to omit from level (for optimization purposes)

function rgb2hsv(r, g, b) {
    let rabs, gabs, babs, rr, gg, bb, h, s, v, diff, diffc, percentRoundFn;
    rabs = r / 255;
    gabs = g / 255;
    babs = b / 255;
    v = Math.max(rabs, gabs, babs),
        diff = v - Math.min(rabs, gabs, babs);
    diffc = c => (v - c) / 6 / diff + 1 / 2;
    percentRoundFn = num => Math.round(num * 100) / 100;
    if (diff == 0) {
        h = s = 0;
    } else {
        s = diff / v;
        rr = diffc(rabs);
        gg = diffc(gabs);
        bb = diffc(babs);

        if (rabs === v) {
            h = bb - gg;
        } else if (gabs === v) {
            h = (1 / 3) + rr - bb;
        } else if (babs === v) {
            h = (2 / 3) + gg - rr;
        }
        if (h < 0) {
            h += 1;
        } else if (h > 1) {
            h -= 1;
        }
    }
    let [hue, saturation, brightness] = [Math.round(h * 360), percentRoundFn(s * 100) / 100, percentRoundFn(v * 100) / 100]
    return `${hue}a${saturation}a${brightness}a0a0`;
}

let DRAW_SCALE = 3;
let offset_x = 0,
    offset_y = 0;

let col = unknown_c();
col.set(rgb(255, 0, 0));

let zo = 0;
let move_groups = unknown_g();

let objects = [];

let saved = 0;

let circle = (x, y, radius, rgba) => {
    let str = rgb2hsv(...rgba.slice(0, -1));

    let o = {
        OBJ_ID: 1764,
        X: (x / DRAW_SCALE) + offset_x,
        Y: (y / DRAW_SCALE) + offset_y,
        SCALING: radius / DRAW_SCALE / 4,
        HVS_ENABLED: 1,
        HVS: str,
        COLOR: col,
        Z_ORDER: zo,
        GROUPS: move_groups
    };

    o.SCALING > min_scale ? $.add(o) : saved++;
    zo++;
    return o
}

let readfile = (filename) => {
    return new Promise((resolve) => {
        let output = [];

        const readStream = fs.createReadStream(filename);

        readStream.on('data', function(chunk) {
            output.push(chunk);
        });

        readStream.on('end', function() {
            resolve(Buffer.concat(output));
        });
    })
}

let image = async (buf) => {
    objects.push([]);
    let image = await Jimp.read(buf);
    image = image.flip(false, true);
    const bitmap = Bitmap.createFromByteArray(image.bitmap.width,
        image.bitmap.height, image.bitmap.data)
    const runner = new ImageRunner(bitmap)
    const options = {
        shapeTypes: [ShapeTypes.CIRCLE],
        candidateShapesPerStep: 50,
        shapeMutationsPerStep: 100,
        alpha: 255
    }
    const iterations = 1200;
    const shapes = []
    for (let i = 0; i < iterations; i++) {
        let x = JSON.parse(ShapeJsonExporter.exportShapes(runner.step(options)));
        let c = circle(...x.data, x.color);
        objects[objects.length - 1].push(c);
    }
};

const zeroPad = (str, length) => '0'.repeat(Math.max(0, length - str.toString().length)) + str.toString();
let json_data = { // tells the program if and how to load JSON files/write to them
    json: true, // use "true" to load an existing JSON file, otherwise "false"
    filepath: "./export.json" // filepath to read from/write to
};

(async () => {
    if (!json_data.json) {
        let frame = 1;
        let max_frames = 111; // amount of frames 
        let folder_name = "../frames"; // folder name where frames are stored

        while (frame < max_frames) {
            let file = await readfile(`${folder_name}/${zeroPad(frame, 4)}.png`);
            await image(file);
            offset_x += 250 * 3;
            console.log(`frame ${frame} done`);
            frame++;
        }

        fs.writeFileSync('export.json', JSON.stringify({
            test: 1,
            scale: DRAW_SCALE,
            objects
        }));
      
        console.log('saved objects:', saved)
        $.exportToSavefile({
            info: true
        });
        console.timeEnd('finished in');

        return;
    }

    let file = await readfile(json_data.filepath);
    file = JSON.parse(file.toString());

    let fscale = file.scale;
    let rescale = 3.4;
    let do_rs = true;

    let optimize = true;

    file.objects.forEach((objs, ofsx) => {
        let ofsx2 = (ofsx * 750);
        objs.forEach((obj, ci) => {
            if (do_rs) {
                let [nx, ny, nscale] = [((obj.X + ofsx2) * fscale), obj.Y * fscale, obj.SCALING * 4 * fscale];

                obj.X = ((nx / rescale) - ofsx2) + 1500 * ofsx;
                obj.Y = ny / rescale;
                obj.SCALING = nscale / rescale / 4
            }
            if (optimize) {
                if (obj.SCALING > min_scale)
                    $.add(obj)
                else {
                    saved++;
                }
            } else {
                $.add(obj);
            }
        });
    });
    console.timeEnd('finished in');
    if (saved) console.log('amount of objects saved:', saved)
    $.exportToSavefile({
        info: true
    });
})();
