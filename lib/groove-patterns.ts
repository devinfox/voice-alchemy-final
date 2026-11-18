/**
 * Real drummer feels for the Rhythm Trainer.
 *
 * Each pattern is the most common two-bar groove for its style, measured from
 * live drummer performances: which drum lands on which 16th note, how hard it
 * was hit (0-127), and how many milliseconds ahead of or behind the grid the
 * drummer actually played it. That last number is the "feel": it is why a real
 * drummer sounds relaxed where a drum machine sounds stiff.
 *
 * Source: Groove MIDI Dataset (Gillick, Roberts, Engel, Eck, Bamman, ICML 2019),
 * licensed CC BY 4.0, as analysed for ByeTalk Studio (tools/data/groove_model.json).
 * Generated file: do not edit by hand.
 */

export type DrumRole = 'kick' | 'snare' | 'hat' | 'openHat'

/** [step (0-31, 16th notes over two bars), velocity (0-127), feel offset in ms] */
export type DrumHit = [number, number, number]

export interface DrumFeel {
  id: string
  label: string
  /** Tempo the feel offsets were measured at. */
  sourceBpm: number
  hits: Partial<Record<DrumRole, DrumHit[]>>
}

export const DRUM_FEELS: DrumFeel[] = [{"id":"pop","label":"Pop","sourceBpm":83,"hits":{"kick":[[0,54,-6.1],[8,52,-2.9],[12,52,-5.4],[16,56,6.4],[26,54,-5.1]],"snare":[[4,118,-6.3],[12,115,-2.6],[20,118,7],[28,120,-0.8]],"hat":[[0,125,-3.1],[2,55,-7.2],[4,127,-0.8],[6,59,-6.9],[8,127,-2.3],[10,56,-5.4],[12,127,1.3],[14,57,-3.9],[16,126,2.9],[18,52,4.8],[20,127,13],[22,51,5.9],[24,124,3.2],[26,56,1],[28,127,2.2],[30,51,-6.7]]}},{"id":"rock","label":"Rock","sourceBpm":112,"hits":{"kick":[[0,93,-30.3],[7,46,2.7],[8,79,-7.9],[16,79,-10.9],[23,46,-2.4],[24,76,-2.2],[29,91,-0.5]],"snare":[[4,126,1.1],[12,127,-7.1],[20,125,-1.1],[27,116,-0.6],[28,126,-0.5]],"hat":[[0,73,-30.3],[2,107,-1.9],[4,112,8.5],[6,115,10.4],[8,103,7.7],[10,100,-0.2],[12,111,1.3],[14,111,2.9],[16,109,-2.4],[18,100,-4.3],[20,111,6.2],[22,111,7.1],[24,107,9.8],[26,113,3.8]],"openHat":[[29,107,-4.6]]}},{"id":"soul","label":"Soul","sourceBpm":105,"hits":{"kick":[[0,60,-8.5],[10,59,-1.4],[15,37,3.8],[16,59,-15.5],[26,59,-9.2],[31,37,8.9]],"snare":[[4,115,4.1],[12,116,0.8],[20,117,-3.7],[28,117,-4.3]],"hat":[[0,88,-1],[2,57,1.6],[4,101,9.9],[6,91,9.1],[8,109,5.6],[10,55,4.8],[12,110,6.2],[14,77,-1],[16,87,-9.2],[18,58,-7.9],[20,95,-1],[22,100,0.1],[24,107,-1.3],[26,55,0.3],[28,107,0.8],[30,77,-2.3]]}},{"id":"funk","label":"Funk","sourceBpm":105,"hits":{"kick":[[0,86,-6.8],[8,77,-3.5],[16,74,-1.4],[19,59,10.3],[21,63,10.2],[23,46,9.3],[24,72,0.6]],"snare":[[4,127,8.7],[12,127,19.8],[20,127,0.9],[28,127,6.8]],"hat":[[0,101,-0.5],[2,16,4.8],[4,109,12.4],[6,23,18.6],[8,39,4.1],[12,62,16.9],[14,28,14.1],[16,100,9.8],[18,27,-0.7],[20,107,4.2],[22,41,12.5],[24,44,4.4],[28,65,5.1],[30,30,1.5]],"openHat":[[10,106,1.5],[26,119,-2.2]]}},{"id":"hiphop","label":"Hip-hop","sourceBpm":87,"hits":{"kick":[[0,76,-29.6],[2,72,-14.6],[7,38,44],[8,87,-12.6],[15,35,37.7],[16,73,-14.1],[18,81,-8.8],[23,39,40.2],[24,92,-12.2],[31,32,18.4]],"snare":[[4,127,-7.3],[12,127,-2.5],[20,127,3.8],[28,127,-7.8]],"hat":[[0,100,-9.3],[2,80,-8.3],[4,116,-7.8],[6,87,-4.9],[8,104,-1.5],[10,51,2.4],[12,124,-0.5],[14,80,3.3],[16,108,-0.5],[18,76,2.9],[20,121,6.2],[22,94,1.9],[24,108,-2.5],[26,49,2.4],[28,117,-6.8],[30,78,-7.8]]}}]

export const STEPS_PER_PATTERN = 32
