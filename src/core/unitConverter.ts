export interface UnitConversionResult {
  inputValue: number;
  fromUnit: string;
  toUnit: string;
  outputValue: number;
  formattedOutput: string;
  category: 'length' | 'weight' | 'temperature' | 'data' | 'speed' | 'time';
  explanation: string;
}

interface LinearUnitSpec {
  canonical: string;
  category: Exclude<UnitConversionResult['category'], 'temperature'>;
  toBaseFactor: number;
}

const UNIT_ALIASES: Record<string, string> = {
  m: 'm',
  meter: 'm',
  meters: 'm',
  metre: 'm',
  metres: 'm',
  km: 'km',
  kilometer: 'km',
  kilometers: 'km',
  kilometre: 'km',
  kilometres: 'km',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  mm: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  mi: 'mi',
  mile: 'mi',
  miles: 'mi',
  ft: 'ft',
  foot: 'ft',
  feet: 'ft',
  in: 'in',
  inch: 'in',
  inches: 'in',
  yd: 'yd',
  yard: 'yd',
  yards: 'yd',

  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',

  c: 'C',
  celsius: 'C',
  centigrade: 'C',
  '°c': 'C',
  f: 'F',
  fahrenheit: 'F',
  '°f': 'F',
  k: 'K',
  kelvin: 'K',

  b: 'B',
  byte: 'B',
  bytes: 'B',
  kb: 'KB',
  kilobyte: 'KB',
  kilobytes: 'KB',
  mb: 'MB',
  megabyte: 'MB',
  megabytes: 'MB',
  gb: 'GB',
  gigabyte: 'GB',
  gigabytes: 'GB',
  tb: 'TB',
  terabyte: 'TB',
  terabytes: 'TB',

  kmh: 'km/h',
  'km/h': 'km/h',
  kph: 'km/h',
  mph: 'mph',
  'm/s': 'm/s',
  ms: 'm/s',

  s: 's',
  sec: 's',
  second: 's',
  seconds: 's',
  min: 'min',
  mins: 'min',
  minute: 'min',
  minutes: 'min',
  hr: 'hr',
  hrs: 'hr',
  hour: 'hr',
  hours: 'hr',
  day: 'day',
  days: 'day',
};

const LINEAR_UNITS: Record<string, LinearUnitSpec> = {
  mm: { canonical: 'mm', category: 'length', toBaseFactor: 0.001 },
  cm: { canonical: 'cm', category: 'length', toBaseFactor: 0.01 },
  m: { canonical: 'm', category: 'length', toBaseFactor: 1 },
  km: { canonical: 'km', category: 'length', toBaseFactor: 1000 },
  in: { canonical: 'in', category: 'length', toBaseFactor: 0.0254 },
  ft: { canonical: 'ft', category: 'length', toBaseFactor: 0.3048 },
  yd: { canonical: 'yd', category: 'length', toBaseFactor: 0.9144 },
  mi: { canonical: 'mi', category: 'length', toBaseFactor: 1609.344 },

  mg: { canonical: 'mg', category: 'weight', toBaseFactor: 0.000001 },
  g: { canonical: 'g', category: 'weight', toBaseFactor: 0.001 },
  kg: { canonical: 'kg', category: 'weight', toBaseFactor: 1 },
  lb: { canonical: 'lb', category: 'weight', toBaseFactor: 0.45359237 },
  oz: { canonical: 'oz', category: 'weight', toBaseFactor: 0.028349523125 },

  B: { canonical: 'B', category: 'data', toBaseFactor: 1 },
  KB: { canonical: 'KB', category: 'data', toBaseFactor: 1024 },
  MB: { canonical: 'MB', category: 'data', toBaseFactor: 1024 ** 2 },
  GB: { canonical: 'GB', category: 'data', toBaseFactor: 1024 ** 3 },
  TB: { canonical: 'TB', category: 'data', toBaseFactor: 1024 ** 4 },

  'm/s': { canonical: 'm/s', category: 'speed', toBaseFactor: 1 },
  'km/h': { canonical: 'km/h', category: 'speed', toBaseFactor: 1 / 3.6 },
  mph: { canonical: 'mph', category: 'speed', toBaseFactor: 0.44704 },

  s: { canonical: 's', category: 'time', toBaseFactor: 1 },
  min: { canonical: 'min', category: 'time', toBaseFactor: 60 },
  hr: { canonical: 'hr', category: 'time', toBaseFactor: 3600 },
  day: { canonical: 'day', category: 'time', toBaseFactor: 86400 },
};

function normalizeUnitToken(raw: string): string | null {
  const clean = raw.trim().toLowerCase().replace(/[?.!,]+$/g, '');
  return UNIT_ALIASES[clean] ?? null;
}

function formatNumber(val: number): string {
  if (Math.abs(val) < 1e-9) return '0';
  if (Number.isInteger(val)) return String(val);
  const rounded = Number(val.toFixed(6));
  return String(rounded);
}

function convertTemperature(value: number, from: string, to: string): number | null {
  let celsius: number;
  if (from === 'C') celsius = value;
  else if (from === 'F') celsius = ((value - 32) * 5) / 9;
  else if (from === 'K') celsius = value - 273.15;
  else return null;

  if (to === 'C') return celsius;
  if (to === 'F') return (celsius * 9) / 5 + 32;
  if (to === 'K') return celsius + 273.15;
  return null;
}

export function tryConvertUnits(rawCommand: string): UnitConversionResult | null {
  const cleaned = rawCommand
    .trim()
    .replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:please\s+)?/i, '')
    .replace(/^(?:convert|what is|how many|turn)\s+/i, '')
    .replace(/[?]+$/g, '')
    .trim();

  const match = cleaned.match(
    /^(-?\d+(?:\.\d+)?)\s*([°a-zA-Z/]+)\s+(?:to|in|into|as)\s+([°a-zA-Z/]+)$/i
  );
  if (!match) return null;

  const inputValue = Number(match[1]);
  if (!Number.isFinite(inputValue)) return null;

  const fromUnit = normalizeUnitToken(match[2]);
  const toUnit = normalizeUnitToken(match[3]);
  if (!fromUnit || !toUnit) return null;

  if ((fromUnit === 'C' || fromUnit === 'F' || fromUnit === 'K') && (toUnit === 'C' || toUnit === 'F' || toUnit === 'K')) {
    const out = convertTemperature(inputValue, fromUnit, toUnit);
    if (out === null) return null;
    const formattedOutput = formatNumber(out);
    return {
      inputValue,
      fromUnit,
      toUnit,
      outputValue: out,
      formattedOutput,
      category: 'temperature',
      explanation: `${inputValue}°${fromUnit} equals ${formattedOutput}°${toUnit}.`,
    };
  }

  const fromSpec = LINEAR_UNITS[fromUnit];
  const toSpec = LINEAR_UNITS[toUnit];
  if (!fromSpec || !toSpec || fromSpec.category !== toSpec.category) {
    return null;
  }

  const baseValue = inputValue * fromSpec.toBaseFactor;
  const outputValue = baseValue / toSpec.toBaseFactor;
  const formattedOutput = formatNumber(outputValue);

  return {
    inputValue,
    fromUnit: fromSpec.canonical,
    toUnit: toSpec.canonical,
    outputValue,
    formattedOutput,
    category: fromSpec.category,
    explanation: `${inputValue} ${fromSpec.canonical} equals ${formattedOutput} ${toSpec.canonical}.`,
  };
}
