// Source: GET https://literotica.com/api/3/constants (no auth needed).
// Mirrors the slices the app uses; rerun the endpoint and patch when
// Literotica adds new options.

// fact_defaults — profile facts. `select` = single code; `checkbox` =
// concatenated codes (e.g. pets="dc" → Dog(s) + Cat(s)); `nosave` = the
// "user did not answer" placeholder, treat as unset.
export type FactType = 'select' | 'checkbox' | 'text' | 'multitext' | 'dob';

export interface FactDef {
  title: string;
  type: FactType;
  values?: { [code: string]: string };
  nosave?: string;
}

export const FACT_DEFS: { [field: string]: FactDef } = ({
  dob: {
    title: 'Date of Birth',
    type: 'dob',
  },
  sex: {
    title: 'Sex',
    type: 'select',
    nosave: 'n',
    values: {
      n: 'No Answer',
      f: 'Female',
      m: 'Male',
      c: 'Couple',
      t: 'Transgender',
      o: 'Transgender Female',
      p: 'Transgender Male',
      i: 'Intersex',
      q: 'Genderqueer',
      l: 'Genderless',
      d: 'Different Identity',
    },
  },
  weight: {
    title: 'Weight',
    type: 'select',
    nosave: 'n',
    values: {
      n: 'No Answer',
      s: 'Skinny',
      a: 'Average',
      l: 'Big & Beautiful',
    },
  },
  height: {
    title: 'Height',
    type: 'select',
    nosave: 'n',
    values: {
      n: 'No Answer',
      s: 'Short',
      a: 'Average',
      t: 'Tall',
    },
  },
  datingstat: {
    title: 'Dating Status',
    type: 'select',
    nosave: 'n',
    values: {
      n: 'No Answer',
      a: 'Attached',
      g: 'Single',
      s: 'Swinger',
      c: 'Curious',
    },
  },
  // Upstream stores this under the truncated key `orientatio`; we rename to
  // `orientation` to match the field name returned in /3/users/{name} payloads.
  orientation: {
    title: 'Orientation',
    type: 'select',
    nosave: 'n',
    values: {
      n: 'No Answer',
      s: 'Straight',
      g: 'Gay',
      b: 'Bisexual',
      a: 'Asexual',
      p: 'Pansexual',
    },
  },
  smoke: {
    title: 'Smoke',
    type: 'select',
    nosave: 'a',
    values: {
      a: 'No Answer',
      n: 'No',
      o: 'Occasionally',
      y: 'Yes',
    },
  },
  drink: {
    title: 'Drink',
    type: 'select',
    nosave: 'a',
    values: {
      a: 'No Answer',
      n: 'No',
      o: 'Occasionally',
      y: 'Yes',
    },
  },
  pets: {
    title: 'Pets',
    type: 'checkbox',
    values: {
      d: 'Dog(s)',
      c: 'Cat(s)',
      b: 'Bird(s)',
      r: 'Reptile(s)',
      o: 'Other',
    },
  },
  lookingfor: {
    title: 'Looking For',
    type: 'checkbox',
    values: {
      f: 'Friends',
      p: 'Sex Partner',
      s: 'Swingers',
      l: 'Lover',
      m: 'Men',
      w: 'Women',
    },
  },
  interests:  { title: 'Interests', type: 'multitext' as FactType },
  fetishes:   { title: 'Fetishes',  type: 'multitext' as FactType },
  languages:  { title: 'Languages', type: 'multitext' as FactType },
  location:   { title: 'Location',  type: 'text' as FactType },
  website:    { title: 'Website',   type: 'text' as FactType },
  facebook:   { title: 'Facebook',  type: 'text' as FactType },
  twitter:    { title: 'Twitter',   type: 'text' as FactType },
}) as { [field: string]: FactDef };

// privacylevels — visibility tier stored on each fact's `privacy_level`.
export const PRIVACY_LEVELS: ReadonlyArray<{ value: number; text: string }> = Object.freeze([
  { value: 0, text: 'public' },
  { value: 1, text: 'friendsonly' },
  { value: 2, text: 'private' },
]);

// DOB has its own enum (separate from PRIVACY_LEVELS).
export const DOB_PRIVACY_LEVELS: ReadonlyArray<{ value: number; text: string }> = Object.freeze([
  { value: 3, text: 'Hide Age' },
  { value: 4, text: 'Show Age' },
  { value: 5, text: 'Show Day/Month' },
  { value: 6, text: 'Show Full Birthday' },
]);

// avatar_props — upload constraints.
export const AVATAR_PROPS = Object.freeze({
  max_size_bytes: 268435456,
  supported_formats: ['jpg', 'jpeg', 'gif', 'png'] as ReadonlyArray<string>,
});
