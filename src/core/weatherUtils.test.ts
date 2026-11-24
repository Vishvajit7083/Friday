import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeatherChatSummary,
  convertTemperature,
  degreesToCompass,
  describeUvIndex,
  formatTemperature,
  getNewSevereWeatherAlertKey,
  parseWeatherQuery,
} from './weatherUtils';
import type { WeatherData } from './types';

test('temperature conversion and formatting handle Celsius and Fahrenheit cleanly', () => {
  assert.equal(convertTemperature(0, 'fahrenheit'), 32);
  assert.equal(convertTemperature(25, 'fahrenheit'), 77);
  assert.equal(convertTemperature(25.4, 'celsius'), 25);
  assert.equal(formatTemperature(20, 'celsius'), '20°C');
  assert.equal(formatTemperature(20, 'fahrenheit'), '68°F');
});

test('compass bearing and UV index helpers produce accurate labels', () => {
  assert.equal(degreesToCompass(0), 'N');
  assert.equal(degreesToCompass(90), 'E');
  assert.equal(degreesToCompass(225), 'SW');
  assert.match(describeUvIndex(1.5), /Low/);
  assert.match(describeUvIndex(6.5), /High/);
  assert.match(describeUvIndex(11.2), /Extreme/);
});

test('parseWeatherQuery extracts city, timeframe, and weather metric accurately', () => {
  const q1 = parseWeatherQuery('What is the weather in Tokyo?');
  assert.equal(q1.isWeather, true);
  assert.equal(q1.location, 'Tokyo');
  assert.equal(q1.timeframe, 'current');

  const q2 = parseWeatherQuery('Will it rain in Mumbai tomorrow?');
  assert.equal(q2.isWeather, true);
  assert.equal(q2.location, 'Mumbai');
  assert.equal(q2.timeframe, 'tomorrow');
  assert.equal(q2.metric, 'rain');

  const q3 = parseWeatherQuery('7-day forecast for San Francisco');
  assert.equal(q3.isWeather, true);
  assert.equal(q3.location, 'San Francisco');
  assert.equal(q3.timeframe, 'week');

  const q4 = parseWeatherQuery('What is the weather today?');
  assert.equal(q4.isWeather, true);
  assert.equal(q4.location, undefined);
  assert.equal(q4.timeframe, 'today');

  const q5 = parseWeatherQuery('Open Google Chrome');
  assert.equal(q5.isWeather, false);
});

test('buildWeatherChatSummary renders current, tomorrow, 7-day, and alert views in requested unit', () => {
  const sample: WeatherData = {
    location: 'Kolhapur, India',
    latitude: 16.7,
    longitude: 74.24,
    temperature: 30,
    condition: 'Partly Cloudy',
    humidity: 60,
    windSpeedKmh: 14,
    windDirectionLabel: 'W',
    pressureHpa: 1012,
    uvIndex: 6.2,
    feelsLike: 32,
    updatedAt: '2026-11-24T10:00:00Z',
    source: 'Open-Meteo Live API',
    forecast: [
      { date: '2026-11-24', tempMax: 32, tempMin: 21, condition: 'Partly Cloudy', code: 2, precipProbMax: 15 },
      { date: '2026-11-25', tempMax: 29, tempMin: 20, condition: 'Rain Showers', code: 80, precipProbMax: 75 },
    ],
    alerts: [
      {
        id: 'wmo-thunder',
        title: 'Heavy Rain Advisory',
        severity: 'warning',
        description: 'Peak rain chance 75% expected tomorrow.',
        source: 'WMO Threshold Advisory',
      },
    ],
  };

  const currentC = buildWeatherChatSummary(sample, parseWeatherQuery('weather'), 'celsius');
  assert.match(currentC, /30°C/);
  assert.match(currentC, /Kolhapur, India/);

  const currentF = buildWeatherChatSummary(sample, parseWeatherQuery('weather'), 'fahrenheit');
  assert.match(currentF, /86°F/);

  const tomorrow = buildWeatherChatSummary(sample, parseWeatherQuery('weather tomorrow'), 'celsius');
  assert.match(tomorrow, /2026-11-25/);
  assert.match(tomorrow, /75%/);

  assert.equal(getNewSevereWeatherAlertKey(sample.alerts), 'wmo-thunder:Heavy Rain Advisory');
});
