// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SidebarPanel } from '../src/ui/SidebarPanel';

describe('SidebarPanel Component', () => {
  let sidebar: SidebarPanel | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    localStorage.clear();
  });

  afterEach(() => {
    sidebar?.destroy();
    sidebar = null;
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('mounts with open state by default, creating container and collapsed pill', () => {
    sidebar = new SidebarPanel();
    sidebar.mount();

    const container = sidebar.getElement();
    const pill = sidebar.getCollapsedPill();

    expect(container).not.toBeNull();
    expect(pill).not.toBeNull();
    expect(sidebar.isOpen()).toBe(true);

    expect(document.body.classList.contains('cr-sidebar-active')).toBe(true);
    expect(document.body.classList.contains('cr-sidebar-closed')).toBe(false);

    expect(container?.style.display).toBe('flex');
    expect(pill?.style.display).toBe('none');
    expect(pill?.textContent).toContain('Subtitles (hidden)');
  });

  it('closes sidebar completely when close() is called', () => {
    const onToggleVisibility = vi.fn();
    sidebar = new SidebarPanel({
      onSeek: () => {},
      onWordClick: () => {},
      onToggleVisibility,
    });
    sidebar.mount();

    sidebar.close();

    const container = sidebar.getElement();
    const pill = sidebar.getCollapsedPill();

    expect(sidebar.isOpen()).toBe(false);
    expect(document.body.classList.contains('cr-sidebar-closed')).toBe(true);
    expect(document.body.classList.contains('cr-sidebar-active')).toBe(false);

    expect(container?.style.display).toBe('none');
    expect(pill?.style.display).toBe('flex');
    expect(onToggleVisibility).toHaveBeenCalledWith(false);
  });

  it('re-opens sidebar and becomes reactive when collapsed pill is clicked', () => {
    const onToggleVisibility = vi.fn();
    sidebar = new SidebarPanel({
      onSeek: () => {},
      onWordClick: () => {},
      onToggleVisibility,
    });
    sidebar.mount();

    // Close first
    sidebar.close();
    expect(sidebar.isOpen()).toBe(false);

    // Click the collapsed pill
    const pill = sidebar.getCollapsedPill();
    pill?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const container = sidebar.getElement();
    expect(sidebar.isOpen()).toBe(true);
    expect(document.body.classList.contains('cr-sidebar-active')).toBe(true);
    expect(document.body.classList.contains('cr-sidebar-closed')).toBe(false);

    expect(container?.style.display).toBe('flex');
    expect(pill?.style.display).toBe('none');
    expect(onToggleVisibility).toHaveBeenLastCalledWith(true);
  });

  it('re-opens sidebar via keyboard Enter on collapsed pill', () => {
    sidebar = new SidebarPanel();
    sidebar.mount();
    sidebar.close();

    const pill = sidebar.getCollapsedPill();
    pill?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(sidebar.isOpen()).toBe(true);
    expect(sidebar.getElement()?.style.display).toBe('flex');
  });

  it('toggles visibility correctly with toggle()', () => {
    sidebar = new SidebarPanel();
    sidebar.mount();

    expect(sidebar.isOpen()).toBe(true);
    sidebar.toggle();
    expect(sidebar.isOpen()).toBe(false);
    sidebar.toggle();
    expect(sidebar.isOpen()).toBe(true);
  });

  it('cleans up DOM and body classes on destroy()', () => {
    sidebar = new SidebarPanel();
    sidebar.mount();

    expect(document.body.classList.contains('cr-sidebar-active')).toBe(true);

    sidebar.destroy();

    expect(sidebar.getElement()).toBeNull();
    expect(sidebar.getCollapsedPill()).toBeNull();
    expect(document.body.classList.contains('cr-sidebar-active')).toBe(false);
    expect(document.body.classList.contains('cr-sidebar-closed')).toBe(false);
    expect(document.querySelector('#codireactor-sidebar-root')).toBeNull();
    expect(document.querySelector('.cr-vv-toggle-in-sidebar')).toBeNull();
  });

  it('renders Arabic translation row in each cue card and highlights active card synchronously', () => {
    sidebar = new SidebarPanel();
    sidebar.mount();

    sidebar.setCues([
      {
        id: 'cue-1',
        startMs: 1000,
        endMs: 3000,
        text: 'Hello world',
        translatedText: 'مرحبا بالعالم',
      },
      {
        id: 'cue-2',
        startMs: 3000,
        endMs: 6000,
        text: 'How are you',
        translatedText: 'كيف حالك',
      },
    ]);

    const container = sidebar.getElement()!;
    const transRows = container.querySelectorAll('.cr-sidebar-trans-row');
    expect(transRows.length).toBe(2);
    expect(transRows[0].textContent).toBe('مرحبا بالعالم');
    expect(transRows[1].textContent).toBe('كيف حالك');

    // At 1500ms -> First row is active
    sidebar.setActiveTime(1500);
    const rows = container.querySelectorAll('.cr-sidebar-cue-row');
    expect(rows[0].classList.contains('cr-active-row')).toBe(true);
    expect(rows[1].classList.contains('cr-active-row')).toBe(false);

    // At 3200ms -> Second row is active
    sidebar.setActiveTime(3200);
    expect(rows[0].classList.contains('cr-active-row')).toBe(false);
    expect(rows[1].classList.contains('cr-active-row')).toBe(true);
  });
});

