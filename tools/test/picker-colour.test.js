// The tile colour of an icon in the Inputs picker (picker/app/index.html): cornerColour() gives the colour of a picture's own flat
// background, taken from its four corners, and nothing when the corners are not alike; darkLogo() says a transparent logo is drawn in
// near-black, which needs a light tile. The picker is one page with its script inline, so the two functions are cut out of it as they are.
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { root, ok, run } = require('./lib');

// the source of one top-level function of the page, from "function name(" to its closing brace
function source(html, name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) return '';
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  return '';
}

run(async () => {
  const html = fs.readFileSync(path.join(root, 'picker', 'app', 'index.html'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(source(html, 'cornerColour') + '\n' + source(html, 'darkLogo'), sandbox, { filename: 'picker colour functions' });
  const N = 32;
  // an N x N picture in RGBA with an opaque coloured body, in which a few areas are changed by the test
  function picture(fill) {
    const d = new Uint8ClampedArray(N * N * 4);
    for (let i = 0; i < N * N; i++) set(d, i % N, Math.floor(i / N), fill || [200, 30, 90, 255]);
    return d;
  }
  function set(d, x, y, c) {
    const j = (y * N + x) * 4;
    d[j] = c[0];
    d[j + 1] = c[1];
    d[j + 2] = c[2];
    d[j + 3] = c.length > 3 ? c[3] : 255;
  }
  function rect(d, x0, y0, x1, y1, c) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(d, x, y, c);
  }
  // the four 3 x 3 corners, as cornerColour reads them
  function corners(d, cs) {
    const at = [
      [0, 0],
      [N - 3, 0],
      [0, N - 3],
      [N - 3, N - 3],
    ];
    cs.forEach((c, k) => rect(d, at[k][0], at[k][1], at[k][0] + 2, at[k][1] + 2, c));
    return d;
  }
  const four = v => [v, v, v, v];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clear = [0, 0, 0, 0];

  ok(typeof sandbox.cornerColour === 'function' && typeof sandbox.darkLogo === 'function', 'the picker has cornerColour and darkLogo');

  ok(eq(sandbox.cornerColour(corners(picture(), four([0, 0, 0])), N), [0, 0, 0]), 'flat black corners give black (a logo on black)');
  ok(eq(sandbox.cornerColour(corners(picture(), four([255, 255, 255])), N), [255, 255, 255]), 'flat white corners give white');
  ok(eq(sandbox.cornerColour(corners(picture(), four([20, 40, 60])), N), [20, 40, 60]), 'flat corners of another colour give that colour');
  ok(
    eq(
      sandbox.cornerColour(
        corners(picture(), [
          [10, 10, 10],
          [10, 10, 10],
          [10, 10, 10],
          [14, 14, 14],
        ]),
        N
      ),
      [11, 11, 11]
    ),
    'nearly equal corners give their average, rounded'
  );
  ok(
    sandbox.cornerColour(
      corners(picture(), [
        [0, 0, 0],
        [0, 0, 0],
        [255, 255, 255],
        [255, 255, 255],
      ]),
      N
    ) === null,
    'a gradient (dark above, light below) gives nothing'
  );
  ok(
    sandbox.cornerColour(
      corners(picture(), [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [60, 60, 60],
      ]),
      N
    ) === null,
    'corners that differ too much give nothing'
  );
  ok(
    sandbox.cornerColour(corners(picture(), [[0, 0, 0], [0, 0, 0], [0, 0, 0], clear]), N) === null,
    'a transparent corner gives nothing (an icon with a margin, or rounded corners)'
  );
  ok(
    sandbox.cornerColour(
      corners(picture(), [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0, 200],
      ]),
      N
    ) === null,
    'a corner that is only partly opaque gives nothing'
  );

  // a transparent picture with a dark glyph in it (the shape of a letter: gaps inside its box)
  const glyph = c => {
    const d = picture(clear);
    rect(d, 4, 10, 27, 13, c); // a bar
    rect(d, 14, 10, 17, 24, c); // the stem of a T
    return d;
  };
  ok(sandbox.darkLogo(glyph([40, 40, 44, 255]), N) === true, 'a near-black logo on transparent needs a light tile');
  ok(sandbox.darkLogo(glyph([240, 190, 40, 255]), N) === false, 'a bright colourful logo on transparent is not dark');
  ok(sandbox.darkLogo(glyph([255, 255, 255, 255]), N) === false, 'a white logo on transparent is not dark');
  const bar = picture(clear);
  rect(bar, 2, 12, 29, 17, [20, 20, 20, 255]);
  ok(sandbox.darkLogo(bar, N) === true, 'a wide near-black shape counts as a logo (not roughly square)');
  const block = picture(clear);
  rect(block, 4, 4, 27, 27, [20, 20, 20, 255]);
  ok(sandbox.darkLogo(block, N) === false, 'a solid near-black square with a margin is not a logo (it keeps its own tile)');
  ok(sandbox.darkLogo(picture(clear), N) === false, 'a picture with nothing visible is not a dark logo');
});
