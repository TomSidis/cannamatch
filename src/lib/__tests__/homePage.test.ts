import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '../../CannaMatch.jsx'), 'utf8');
const community = readFileSync(join(__dirname, '../../components/CommunitySplitScreen.jsx'), 'utf8');

describe('home page — mascot removed', () => {
  it('GreetingMascot function does not exist', () => {
    expect(src).not.toContain('function GreetingMascot');
  });

  it('GREET_LINES constant does not exist', () => {
    expect(src).not.toContain('GREET_LINES');
  });

  it('no GreetingMascot render site', () => {
    expect(src).not.toContain('<GreetingMascot');
  });
});

describe('home page — plant background removed from app shell', () => {
  it('no Vivid plant background comment (app-shell plant layer gone)', () => {
    expect(src).not.toContain('Vivid plant background');
  });

  it('app shell (screen === app) does not contain plant image div', () => {
    // Extract only the app screen block and confirm the plant background is absent
    const appBlockStart = src.indexOf('{screen === "app"');
    const appBlock = src.slice(appBlockStart, appBlockStart + 1200);
    expect(appBlock).not.toContain('9-Best-Purple-Strains');
    expect(appBlock).not.toContain('saturate(1.55)');
  });
});

describe('home page — single scroll container', () => {
  it('CommunitySplitScreen root has no height:100% isolation', () => {
    // The root div used to have height:'100%' and overflow:'hidden'
    // which created a scroll isolation context — that must be gone
    expect(community).not.toMatch(/height:\s*['"]100%['"]/);
  });

  it('CommunitySplitScreen feed div has no overflowY:auto', () => {
    // The feed div used to have overflowY:'auto' (nested scrollbar)
    expect(community).not.toMatch(/overflowY:\s*['"]auto['"]/);
  });

  it('outer main is the single overflow-y-auto container', () => {
    // The <main> tag with overflow-y-auto is the one scroll container
    expect(src).toContain('overflow-y-auto');
  });
});
