// Runtime patches for Ionic 3's DeepLinker / Tabs / Tab / UrlSerializer.
//
// Goals (in increasing complexity):
//
//   1. Survive page reload — restore the deep page that was on top of the
//      tab when the user reloaded. Upstream Ionic 3 only hydrates URL
//      segments down to the first nav whose children haven't mounted yet,
//      so deep pages get dropped on cold start. We re-process the URL on
//      each viewDidEnter as new navs come online.
//
//   2. Preserve the tab's back stack on URL-driven deep entry — upstream
//      Tabs._updateCurrentTab uses setRoot in the URL-fromUrl branch,
//      wiping the tab's own root from underneath the deep page. We push
//      instead when the tab already has views.
//
//   3. Keep URLs clean — no tab name in URL. Whether you opened a story
//      from the History tab or the Search tab, URL is `/app/story/:id/read`,
//      not `/app/<tab-title>/story/:id/read`. On reload the deep page
//      lands on whichever tab happens to be the default; tab choice
//      isn't restored, the deep page is. This is the "URLs are about
//      what you're looking at, not how you got there" trade-off.
//
//   4. Tab back-stack on cold load — when a URL-driven deep segment is
//      pushed onto an empty tab, prepend the tab's own root first so
//      back navigation has somewhere to go.
//
// Imported from main.ts before AppModule so the prototype patches are in
// place before any DeepLinker / Tabs / Tab / UrlSerializer is constructed.

import { DeepLinker, Tabs, Tab, UrlSerializer } from 'ionic-angular';
import { normalizeUrl, getNavFromTree } from 'ionic-angular/navigation/deep-linker';

const PATCHED_FLAG = '__litappDeepLinkPatched';

// ---------------------------------------------------------------------------
// DeepLinker.init — capture the initial URL and re-process it as new navs
// come online. Self-unsubscribes once every URL segment has been claimed.
// ---------------------------------------------------------------------------

if (!(DeepLinker.prototype as any)[PATCHED_FLAG]) {
  (DeepLinker.prototype as any)[PATCHED_FLAG] = true;

  const origInit = DeepLinker.prototype.init;

  DeepLinker.prototype.init = function patchedInit() {
    // tslint:disable-next-line: no-this-assignment
    const linker: any = this;
    const initialUrl = normalizeUrl(linker._location.path());
    origInit.call(this);
    linker._litappInitialUrl = initialUrl;
    linker._litappProcessedNavIds = {};
    linker._litappViewSub = linker._app.viewDidEnter.subscribe(() => {
      setTimeout(() => processInitialUrl(linker), 0);
    });
  };

  // Patch getSegmentFromTab so the URL-side segment for a tabs container
  // becomes "transparent" when the tab is showing its own root: no URL
  // piece for it. Combined with the serialize patch below (which turns
  // tabs-typed segments into nav-style ones), this strips tab names from
  // the URL completely. URLs only encode TabsPage + the deep page on top.
  const deepLinkerProto = DeepLinker.prototype as any;
  deepLinkerProto.getSegmentFromTab = function patchedGetSegmentFromTab(navContainer: any, component: any, data: any) {
    if (!navContainer || !navContainer.parent) return null;
    const tabsNav = navContainer.parent;
    const activeChildNavs = tabsNav.getActiveChildNavs && tabsNav.getActiveChildNavs();
    if (!activeChildNavs || !activeChildNavs.length) return null;
    const activeChildNav = activeChildNavs[0];
    const view = activeChildNav.getActive && activeChildNav.getActive(true);
    let comp = component;
    let payload = data;
    if (view) {
      comp = view.component;
      payload = view.data;
    }
    // Tab is showing its own root — emit no URL piece. URL stays at
    // /app while the user browses the default-tab home view.
    if (view && activeChildNav.root && (view.id === activeChildNav.root || view.component === activeChildNav.root)) {
      return null;
    }
    return this._serializer.serializeComponent(tabsNav, comp, payload);
  };
}

function processInitialUrl(linker: any) {
  if (!linker._litappViewSub) return;
  const browserUrl = linker._litappInitialUrl || normalizeUrl(linker._location.path());
  const activeNavContainers = linker._app.getActiveNavContainers();
  if (!activeNavContainers || !activeNavContainers.length) return;
  const segments = linker.getCurrentSegments(browserUrl);
  if (!segments.length) {
    unsubscribe(linker);
    return;
  }
  let allHandled = true;
  for (const segment of segments) {
    if (!segment || !segment.navId) continue;
    if (linker._litappProcessedNavIds[segment.navId]) continue;
    let placed = false;
    for (const root of activeNavContainers) {
      const nav = getNavFromTree(root, segment.navId);
      if (nav) {
        if (alreadyShowing(nav, segment)) {
          linker._litappProcessedNavIds[segment.navId] = true;
          placed = true;
          break;
        }
        linker._litappProcessedNavIds[segment.navId] = true;
        linker._loadViewForSegment(nav, segment, () => {});
        placed = true;
        break;
      }
    }
    if (!placed) allHandled = false;
  }
  if (allHandled) unsubscribe(linker);
}

function alreadyShowing(nav: any, segment: any): boolean {
  if (nav.getSelected) {
    // Tabs container. The selected tab isn't authoritative during the
    // initial mount window — _tabSwitchEnd (which sets isSelected) runs
    // *after* the tab's setPages completes, but our retry can fire from
    // viewDidEnter inside that setPages. So scan every tab's top view as
    // well as the (possibly null) selected tab.
    const sel = nav.getSelected();
    if (sel) {
      const top = sel.last && sel.last();
      if (top && matches(top, segment)) return true;
    }
    if (nav._tabs && nav._tabs.length) {
      for (const t of nav._tabs) {
        const top = t.last && t.last();
        if (top && matches(top, segment)) return true;
      }
    }
    return false;
  }
  const top = nav.last && nav.last();
  return !!top && matches(top, segment);
}

function matches(viewController: any, segment: any): boolean {
  if (!viewController || !segment) return false;
  if (segment.name && viewController.name === segment.name) return true;
  if (segment.id && viewController.id === segment.id) return true;
  if (segment.component && viewController.component === segment.component) return true;
  return false;
}

function unsubscribe(linker: any) {
  if (linker._litappViewSub) {
    linker._litappViewSub.unsubscribe();
    linker._litappViewSub = null;
  }
}

// ---------------------------------------------------------------------------
// UrlSerializer.serialize — drop the tab-secondary identifier from URLs by
// converting tabs-typed segments to nav-typed ones at output time. The
// segments are already correctly hydrated against the tabs container for
// purposes of dispatch; we just don't want the secondary in the URL string.
// ---------------------------------------------------------------------------

if (!(UrlSerializer.prototype as any)[PATCHED_FLAG]) {
  (UrlSerializer.prototype as any)[PATCHED_FLAG] = true;

  const urlSerializerProto = UrlSerializer.prototype as any;
  const origSerialize = urlSerializerProto.serialize;

  urlSerializerProto.serialize = function patchedSerialize(segments: any[]) {
    const remapped = segments.map((s: any) => {
      if (s && s.type === 'tabs') {
        return Object.assign({}, s, { type: 'nav', requiresExplicitNavPrefix: false });
      }
      return s;
    });
    return origSerialize.call(this, remapped);
  };
}

// ---------------------------------------------------------------------------
// Tabs._updateCurrentTab — push instead of setRoot in the URL-driven branch
// so the tab's own root survives under the deep page (only used when the
// tab already has views; cold-load is handled by the Tab.load patch below).
// ---------------------------------------------------------------------------

if (!(Tabs.prototype as any)[PATCHED_FLAG]) {
  (Tabs.prototype as any)[PATCHED_FLAG] = true;

  const tabsProto = Tabs.prototype as any;
  const origUpdate = tabsProto._updateCurrentTab;

  tabsProto._updateCurrentTab = function patchedUpdate(tab: any, fromUrl: boolean) {
    if (!fromUrl || !tab || !tab._segment) {
      return origUpdate.call(this, tab, fromUrl);
    }
    const active = tab.getActive ? tab.getActive() : null;
    if (!active) return origUpdate.call(this, tab, fromUrl);
    const seg = tab._segment;
    const vc = tab.getViewById ? tab.getViewById(seg.name) : null;
    if (vc) return origUpdate.call(this, tab, fromUrl);
    if (tab._views && tab._views.length === 0 && seg.defaultHistory && seg.defaultHistory.length) {
      return origUpdate.call(this, tab, fromUrl);
    }
    if (tab._views && tab._views.length > 0) {
      return tab.push(seg.name, seg.data, { animate: false, updateUrl: true }).then(() => {
        tab._segment = null;
      });
    }
    return origUpdate.call(this, tab, fromUrl);
  };
}

// ---------------------------------------------------------------------------
// Tab.load — when an empty tab is asked to load a URL-driven deep segment
// that isn't its own root, prepend the tab's root first so the user has
// somewhere to go back to inside the tab. Without this, cold-load of a
// URL like /app/story/:id leaves the tab with stack [StoryViewPage] only.
// ---------------------------------------------------------------------------

if (!(Tab.prototype as any)[PATCHED_FLAG]) {
  (Tab.prototype as any)[PATCHED_FLAG] = true;

  const tabProto = Tab.prototype as any;
  const origTabLoad = tabProto.load;

  tabProto.load = function patchedLoad(opts: any) {
    const seg = this._segment;
    if (
      seg &&
      seg.name &&
      this.root &&
      seg.name !== this.root &&
      this._views &&
      this._views.length === 0 &&
      !(seg.defaultHistory && seg.defaultHistory.length)
    ) {
      // Synthesize defaultHistory = [tab.root] so the original tab.load
      // builds the back stack via setPages([tab.root, deepView]) atomically.
      // Pushing the two views back-to-back instead would transition
      // tab.root through ionViewWillEnter → ionViewWillLeave during the
      // cold load, which corrupts pages whose data load is gated on
      // willEnter (e.g., HistoryPage's buildList).
      seg.defaultHistory = [typeof this.root === 'string' ? this.root : this.root.name];
    }
    return origTabLoad.call(this, opts);
  };
}
