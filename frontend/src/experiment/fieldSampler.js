/**
 * fieldSampler — turns the modeled static field into a finite set of sampled
 * field lines for rendering.
 *
 * CURRENT MODEL: the experiment assumes a spatially UNIFORM B₀ along +Z (the
 * quantization axis used by the backend).  Every seed point therefore samples
 * the same direction.  The finite number of rendered lines is a VISUAL SAMPLING
 * of a continuous field — it does not represent a physical count of field lines.
 *
 * FUTURE B(r, t): the return shape (seed point + sampled direction per line) is
 * chosen so a future non-uniform field provider can supply position-dependent
 * sampled vectors on a grid or seed set without changing the renderer.  No
 * spatial solver is implemented now, and no curvature/gradient is invented that
 * is not present in the model (req: do not imply variation that isn't modeled).
 */

const DEFAULT_SEEDS = [[0, 0], [0.24, 0], [-0.24, 0], [0, 0.24], [0, -0.24]];

/**
 * @param {object} model
 * @param {[number,number,number]} model.direction  backend B₀ direction (unit)
 * @param {boolean} model.uniform                    true → same dir at every seed
 * @param {[number,number][]} model.seeds            XY seed points
 * @param {[number,number]} model.zSpan              line extent along the field axis
 * @param {(seed:number[])=>number[]} [model.sample] future: B(r) direction at a seed
 * @returns {{seed:number[],direction:number[],p0:number[],p1:number[]}[]}
 */
export function sampleFieldLines(model = {}) {
  const {
    direction = [0, 0, 1],
    uniform = true,
    seeds = DEFAULT_SEEDS,
    zSpan = [-0.9, 0.9],
    sample = null,
  } = model;

  return seeds.map(([x, y]) => {
    // Uniform field → constant direction. A future B(r,t) provider supplies
    // `sample(seed)` to return the locally sampled direction instead.
    const dir = !uniform && typeof sample === "function" ? sample([x, y]) : direction;
    return {
      seed:      [x, y],
      direction: dir,
      p0:        [x, y, zSpan[0]],
      p1:        [x, y, zSpan[1]],
    };
  });
}

/** Whether the modeled field is spatially uniform (true for the current experiment). */
export function isUniformField(model = {}) {
  return model.uniform !== false;
}
