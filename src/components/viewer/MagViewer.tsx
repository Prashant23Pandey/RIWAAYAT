"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PAGES_META, TOTAL_PAGES, type PageMeta } from "@/lib/pages-meta";

const DESIGN_W = 1024;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type HoverAnim = { el: HTMLElement; names: string[] };

type ScrollAnim = {
  el: HTMLElement;
  pathLen: number;
  fixed: boolean;
  topInCanvas: number; // design px (content widgets)
  marginLeft: number;
  width: number;
  fade: boolean;
  panner?: boolean;
  order?: number;
};

type PageRuntime = {
  loaded: boolean;
  hydrated: boolean;
  canvas: HTMLDivElement | null;
  loadAnims: HTMLElement[];
  loadNames: string[][];
  hovers: HoverAnim[];
  scrolls: ScrollAnim[];
  slideInCount: number;
  fixedContainers: HTMLElement[];
};

function makeRuntime(): PageRuntime {
  return {
    loaded: false,
    hydrated: false,
    canvas: null,
    loadAnims: [],
    loadNames: [],
    hovers: [],
    scrolls: [],
    slideInCount: 0,
    fixedContainers: [],
  };
}

/* ------------------------------------------------------------------ */
/*  Offset-path helpers                                                */
/* ------------------------------------------------------------------ */

function extractPathD(offsetPath: string): string | null {
  const m = offsetPath.match(/path\(\s*["']([^"']+)["']\s*\)/);
  return m ? m[1] : null;
}

function cubicLength(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
): number {
  let len = 0;
  let px = x0;
  let py = y0;
  const STEPS = 24;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    const x = a * x0 + b * x1 + c * x2 + d * x3;
    const y = a * y0 + b * y1 + c * y2 + d * y3;
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return len;
}

function pathLengthFromD(d: string): number {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  if (!tokens) return 0;
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let len = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      cx = num();
      cy = num();
      sx = cx;
      sy = cy;
    } else if (cmd === "m") {
      cx += num();
      cy += num();
      sx = cx;
      sy = cy;
    } else if (cmd === "C") {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const x = num();
      const y = num();
      len += cubicLength(cx, cy, x1, y1, x2, y2, x, y);
      cx = x;
      cy = y;
    } else if (cmd === "c") {
      const x1 = cx + num();
      const y1 = cy + num();
      const x2 = cx + num();
      const y2 = cy + num();
      const x = cx + num();
      const y = cy + num();
      len += cubicLength(cx, cy, x1, y1, x2, y2, x, y);
      cx = x;
      cy = y;
    } else if (cmd === "L") {
      const x = num();
      const y = num();
      len += Math.hypot(x - cx, y - cy);
      cx = x;
      cy = y;
    } else if (cmd === "l") {
      const x = cx + num();
      const y = cy + num();
      len += Math.hypot(x - cx, y - cy);
      cx = x;
      cy = y;
    } else if (cmd === "H") {
      const x = num();
      len += Math.abs(x - cx);
      cx = x;
    } else if (cmd === "h") {
      const x = cx + num();
      len += Math.abs(x - cx);
      cx = x;
    } else if (cmd === "V") {
      const y = num();
      len += Math.abs(y - cy);
      cy = y;
    } else if (cmd === "v") {
      const y = cy + num();
      len += Math.abs(y - cy);
      cy = y;
    } else if (cmd === "Z" || cmd === "z") {
      len += Math.hypot(sx - cx, sy - cy);
      cx = sx;
      cy = sy;
    }
  }
  return len;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MagViewer({ initialPage }: { initialPage: number }) {
  const [current, setCurrent] = useState(
    Math.min(TOTAL_PAGES, Math.max(1, initialPage))
  );
  const [scale, setScale] = useState(1);
  const [vh, setVh] = useState(672);
  const [ready, setReady] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRefs = useRef<(HTMLDivElement | null)[]>([]);
  const runtimeRef = useRef<PageRuntime[]>(PAGES_META.map(() => makeRuntime()));
  const htmlRef = useRef<string[]>([]);
  const scaleRef = useRef(1);
  const vhRef = useRef(672);
  const currentRef = useRef(current);
  const lastNavRef = useRef(0);

  currentRef.current = current;

  /* ---------------- load page html ---------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const results = await Promise.all(
          PAGES_META.map(async (m) => {
            const res = await fetch(
              `/pages/p${String(m.n).padStart(2, "0")}.html`
            );
            if (!res.ok) throw new Error(`page ${m.n}: ${res.status}`);
            return res.text();
          })
        );
        if (!alive) return;
        htmlRef.current = results;
        setReady(true);
      } catch (err) {
        console.error("Failed to load pages", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- responsive scale ---------------- */
  const applyScale = useCallback(() => {
    const s = window.innerWidth / DESIGN_W;
    scaleRef.current = s;
    vhRef.current = window.innerHeight;
    setScale(s);
    setVh(window.innerHeight);
    requestAnimationFrame(() => {
      const rt = runtimeRef.current[currentRef.current - 1];
      if (rt?.hydrated) applyScroll(rt, currentRef.current);
    });
  }, []);

  useEffect(() => {
    applyScale();
    window.addEventListener("resize", applyScale);
    return () => window.removeEventListener("resize", applyScale);
  }, [applyScale]);

  /* ---------------- scroll application ---------------- */
  const applyScroll = useCallback((rt: PageRuntime, n: number) => {
    const slide = slidesRef.current[n - 1];
    if (!slide || !rt.canvas) return;
    const meta = PAGES_META[n - 1];
    const s = scaleRef.current;
    const vhDesign = slide.clientHeight / s;
    const sc = slide.scrollTop;
    const ds = sc / s;
    const canvasTopOffset = Math.max(
      0,
      (slide.clientHeight - meta.height * s) / 2
    );

    // keep fixed containers pinned to the viewport
    const fixedY = (sc - canvasTopOffset) / s;
    for (const fc of rt.fixedContainers) {
      fc.style.transform = `translateY(${fixedY}px)`;
      fc.style.height = `${vhDesign}px`;
    }

    const isShop = n === 4;
    const range = Math.max(1, meta.height - vhDesign);

    for (const item of rt.scrolls) {
      const travel = item.pathLen > 0.5 ? item.pathLen : 300;
      let p: number;
      if (item.fixed && !isShop) {
        // Readymag: fixed widgets seek(screenScrollTop) with a timeline
        // measured in design px — 1 screen px of scroll = 1 px of path.
        p = sc / travel;
      } else if (item.fixed && isShop) {
        // shop page: the horizontal scroll-jacked page. The original delays
        // live in unpublished widget data, so screens are distributed
        // across the scroll range (documented approximation).
        if (item.panner) {
          p = ds / (0.9 * range);
        } else {
          const N = Math.max(1, rt.slideInCount);
          const slice = (0.85 * range) / N;
          const start = item.marginLeft < 0 ? 0 : 0.08 * range + (item.order ?? 0) * slice;
          const dur = Math.min(Math.max(travel, 500), 0.35 * range);
          p = (ds - start) / dur;
        }
      } else {
        // content widgets: trigger when the widget enters the viewport
        // (Readymag default start_point = "bottom")
        const start = Math.max(0, item.topInCanvas - vhDesign);
        p = (ds - start) / travel;
      }
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (item.pathLen > 0.5) {
        item.el.style.offsetDistance = `${(p * item.pathLen).toFixed(2)}px`;
      }
      if (item.fade) {
        item.el.style.opacity = p.toFixed(3);
      }
    }
  }, []);

  /* ---------------- hydration ---------------- */
  const hydratePage = useCallback((rt: PageRuntime, n: number) => {
    const canvas = rt.canvas;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const s = scaleRef.current;

    rt.fixedContainers = Array.from(
      canvas.querySelectorAll<HTMLElement>(
        ".fixed-position-container, .fixed-position-container-top"
      )
    );

    const containers = Array.from(
      canvas.querySelectorAll<HTMLElement>(".animation-container")
    );

    for (const el of containers) {
      const styleTags = Array.from(el.children).filter(
        (c) => c.tagName === "STYLE"
      ) as HTMLElement[];
      const kfText = styleTags.map((st) => st.textContent || "").join("\n");
      const names = Array.from(
        kfText.matchAll(/@keyframes\s+([\w-]+)/g)
      ).map((m) => m[1]);
      let offsetPath = el.style.getPropertyValue("offset-path");
      if (!offsetPath) {
        const pm = (el.getAttribute("style") || "").match(
          /offset-path:\s*(path\([^;]*\))/
        );
        if (pm) offsetPath = pm[1];
      }
      const pathD = extractPathD(offsetPath);
      const pathLen = pathD ? pathLengthFromD(pathD) : 0;
      const wrapsHover = !!el.querySelector(".has-onhover-animation");
      const hasFade = /opacity:\s*0(?:\D|$)/.test(kfText);
      const hasScaleUp = /scale\(\s*(?:1\.[1-9]|[2-9])/.test(kfText);

      if (names.length > 0) {
        if (!hasFade && hasScaleUp && wrapsHover) {
          rt.hovers.push({ el, names });
        } else {
          rt.loadAnims.push(el);
          rt.loadNames.push(names);
        }
      } else if (pathD && (pathLen > 0.5 || el.style.opacity === "0")) {
        const inFixed = !!el.closest(
          ".fixed-position-container, .fixed-position-container-top"
        );
        const scrollItem: ScrollAnim = {
          el,
          pathLen,
          fixed: inFixed,
          topInCanvas: 0,
          marginLeft: parseFloat(el.style.marginLeft) || 0,
          width: parseFloat(el.style.width) || 0,
          fade: el.style.opacity === "0",
        };
        if (!inFixed) {
          const r = el.getBoundingClientRect();
          scrollItem.topInCanvas = (r.top - canvasRect.top) / s;
        }
        el.classList.remove("invisible");
        rt.scrolls.push(scrollItem);
      }
    }

    // shop page window ordering
    if (n === 4) {
      const slideIns = rt.scrolls
        .filter((x) => x.fixed && x.width < 2000)
        .sort((a, b) => a.marginLeft - b.marginLeft);
      slideIns.forEach((x, i) => {
        x.order = i;
      });
      rt.scrolls.forEach((x) => {
        if (x.fixed && x.width >= 2000) x.panner = true;
      });
      rt.slideInCount = slideIns.length;
    }

    // hover animations
    for (const h of rt.hovers) {
      const host =
        (h.el.querySelector("a, .rmwidget") as HTMLElement | null) || h.el;
      const names = h.names.join(", ");
      host.addEventListener("pointerenter", () => {
        h.el.style.animation = `${names} 500ms ease-in-out both`;
      });
      host.addEventListener("pointerleave", () => {
        h.el.style.animation = `${names} 500ms ease-in-out both reverse`;
      });
    }

    hydrateForms(canvas, n);
  }, []);

  /* ---------------- load animations ---------------- */
  const playLoads = useCallback((rt: PageRuntime) => {
    for (let i = 0; i < rt.loadAnims.length; i++) {
      const el = rt.loadAnims[i];
      const names = rt.loadNames[i];
      if (!names.length) continue;
      el.classList.remove("invisible");
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animationName = names.join(", ");
      el.style.animationDuration = names.map(() => "1000ms").join(", ");
      el.style.animationDelay = names.map((_, k) => `${k * 1000}ms`).join(", ");
      el.style.animationTimingFunction = "linear";
      el.style.animationFillMode = "both";
      el.style.animationIterationCount = "1";
      el.style.animationDirection = "normal";
      el.style.animationPlayState = "running";
    }
  }, []);

  /* ---------------- page activation ---------------- */
  useEffect(() => {
    if (!ready) return;
    const n = current;
    const rt = runtimeRef.current[n - 1];
    const canvas = canvasRefs.current[n - 1];
    if (!canvas) return;

    if (!rt.loaded) {
      canvas.innerHTML = htmlRef.current[n - 1] || "";
      rt.loaded = true;
      rt.canvas = canvas;
    }
    if (!rt.hydrated) {
      rt.hydrated = true;
      hydratePage(rt, n);
    }

    const raf = requestAnimationFrame(() => {
      playLoads(rt);
      applyScroll(rt, n);
    });
    return () => cancelAnimationFrame(raf);
  }, [current, ready, hydratePage, playLoads, applyScroll]);

  /* ---------------- per-slide scroll listeners ---------------- */
  useEffect(() => {
    if (!ready) return;
    const cleanups: Array<() => void> = [];
    slidesRef.current.forEach((slide, i) => {
      if (!slide) return;
      let raf = 0;
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const rt = runtimeRef.current[i];
          if (rt.hydrated) applyScroll(rt, i + 1);
        });
      };
      slide.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => slide.removeEventListener("scroll", onScroll));
    });
    return () => cleanups.forEach((fn) => fn());
  }, [ready, applyScroll]);

  /* ---------------- navigation ---------------- */
  const goTo = useCallback((n: number) => {
    const target = Math.min(TOTAL_PAGES, Math.max(1, n));
    const now = Date.now();
    if (now - lastNavRef.current < 700) return;
    if (target === currentRef.current) return;
    lastNavRef.current = now;
    setCurrent(target);
    const url = target === 1 ? "/" : `/${target}`;
    if (window.location.pathname !== url) {
      window.history.pushState({ page: target }, "", url);
    }
  }, []);

  const step = useCallback(
    (dir: number) => goTo(currentRef.current + dir),
    [goTo]
  );

  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/(\d+)/);
      const n = m ? parseInt(m[1], 10) : 1;
      setCurrent(Math.min(TOTAL_PAGES, Math.max(1, n)));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ---------------- wheel / touch / keys ---------------- */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      const slide = slidesRef.current[currentRef.current - 1];
      if (!slide) return;
      const atTop = slide.scrollTop <= 0;
      const atBottom =
        slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 2;
      const horizontal =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 4;
      if (horizontal) {
        e.preventDefault();
        step(e.deltaX > 0 ? 1 : -1);
      } else if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        step(1);
      } else if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        step(-1);
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });

    let touchStart: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStart = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        step(dx < 0 ? 1 : -1);
      }
    };
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });

    const onKey = (e: KeyboardEvent) => {
      const slide = slidesRef.current[currentRef.current - 1];
      if (!slide) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowDown" || e.key === "PageDown") {
        const atBottom =
          slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 2;
        if (atBottom) {
          e.preventDefault();
          step(1);
        }
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        const atTop = slide.scrollTop <= 0;
        if (atTop) {
          e.preventDefault();
          step(-1);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(1);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(TOTAL_PAGES);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, goTo]);

  /* ---------------- click delegation ---------------- */
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const navLink = target.closest("a[data-nav]") as HTMLAnchorElement | null;
      if (navLink) {
        e.preventDefault();
        const n = parseInt(navLink.dataset.nav || "", 10);
        if (Number.isFinite(n)) goTo(n);
        return;
      }
      const back = target.closest("a[data-goback]") as HTMLAnchorElement | null;
      if (back) {
        e.preventDefault();
        if (window.history.length > 1) window.history.back();
        else goTo(4);
        return;
      }
    },
    [goTo]
  );

  /* ---------------- render ---------------- */
  const deckTransform = `translateX(-${(current - 1) * 100}vw)`;

  return (
    <div className="rm-viewport" ref={viewportRef} onClick={onClick}>
      <div className="rm-deck" style={{ transform: deckTransform }}>
        {PAGES_META.map((meta: PageMeta, i: number) => {
          const stageH = Math.max(vh, meta.height * scale);
          const canvasTop = Math.max(0, (vh - meta.height * scale) / 2);
          return (
            <div
              key={meta.n}
              className="rm-slide"
              ref={(el) => {
                slidesRef.current[i] = el;
              }}
              style={{ backgroundColor: meta.bg }}
            >
              <div className="rm-stage" style={{ height: stageH }}>
                <div
                  className="rm-canvas"
                  ref={(el) => {
                    canvasRefs.current[i] = el;
                  }}
                  style={{
                    width: DESIGN_W,
                    height: meta.height,
                    top: canvasTop,
                    transform: `scale(${scale})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {!ready && <div className="rm-loading">EMERGENCE</div>}
      <div className="rm-rotate">Please rotate your device</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Forms runtime                                                      */
/* ------------------------------------------------------------------ */

function hydrateForms(canvas: HTMLElement, pageNum: number) {
  const forms = Array.from(canvas.querySelectorAll<HTMLFormElement>("form"));

  for (const form of forms) {
    // mirror the native selects into the fake-dropdown inputs
    form.querySelectorAll<HTMLSelectElement>("select[name]").forEach((sel) => {
      const input = form.querySelector<HTMLInputElement>(
        `input.fake-dropdown[name="${cssEscape(sel.name)}"]`
      );
      if (!input) return;
      sel.addEventListener("change", () => {
        input.value = sel.value;
      });
    });

    // hover styling for the send button (inline data-default/data-hover)
    form.querySelectorAll<HTMLElement>(".button").forEach((btn) => {
      const def = btn.dataset.default;
      const hov = btn.dataset.hover;
      if (!def) return;
      btn.addEventListener("pointerenter", () => {
        if (hov) btn.setAttribute("style", hov);
      });
      btn.addEventListener("pointerleave", () => {
        btn.setAttribute("style", def);
      });
    });

    form.addEventListener("submit", (e) => e.preventDefault());

    const btn = form.querySelector<HTMLElement>(".button");
    if (!btn) continue;
    btn.addEventListener("click", async () => {
      if (btn.classList.contains("state-pending")) return;
      const fields: Record<string, string> = {};
      form
        .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input[name], textarea[name], select[name]"
        )
        .forEach((el) => {
          const name = el.name;
          if (!name) return;
          if (el.tagName === "SELECT") {
            if (el.value) fields[name] = el.value;
            return;
          }
          if (el.classList.contains("fake-dropdown")) return;
          const v = (el.value || "").trim();
          if (v) fields[name] = v;
        });

      const productEl = form.querySelector<HTMLElement>('[data-sort="0"]');
      const product = productEl?.getAttribute("name") || "unknown";

      const required = [
        "name surname",
        "address",
        "postal code",
        "phone number",
        "Email",
        "delivery",
      ];
      if (form.querySelector('select[name="size"]')) required.push("size");
      const missing = required.filter((r) => !fields[r]);
      if (missing.length) {
        setButtonState(btn, "state-error");
        setTimeout(() => setButtonState(btn, ""), 2600);
        return;
      }

      setButtonState(btn, "state-pending");
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: pageNum, product, fields }),
        });
        if (!res.ok) throw new Error("request failed");
        setButtonState(btn, "state-success");
        form.reset();
        form.querySelectorAll<HTMLInputElement>("input.fake-dropdown").forEach(
          (inp) => {
            inp.value = "";
          }
        );
        setTimeout(() => setButtonState(btn, ""), 4000);
      } catch {
        setButtonState(btn, "state-error");
        setTimeout(() => setButtonState(btn, ""), 2600);
      }
    });
  }
}

function setButtonState(btn: HTMLElement, state: string) {
  btn.classList.remove("state-pending", "state-error", "state-success");
  if (state) btn.classList.add(state);
}

function cssEscape(s: string) {
  return s.replace(/["\\]/g, "\\$&");
}
