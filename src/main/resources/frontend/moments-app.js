const APP = window.__MOMENT_CIRCLE__ || {};
const HOME_PATH = APP.homePath || "/moments";
const COMMENT_API_BASE =
  APP.commentApiBase || "/apis/api.halo.run/v1alpha1/comments";
const METRICS_API_BASE =
  APP.metricsApiBase || "/apis/api.halo.run/v1alpha1/trackers";
const CURRENT_USER_ENDPOINT = "/apis/api.console.halo.run/v1alpha1/users/-";
const COMMENT_WIDGET_MODULES = [
  "https://cdn.jsdelivr.net/npm/@halo-dev/comment-widget@3.1.0/dist/index.js",
  "https://unpkg.com/@halo-dev/comment-widget@3.1.0/dist/index.js",
];

const root = document.getElementById("app-root");
const tagStrip = document.getElementById("tag-strip");
const footer = document.getElementById("page-footer");
const heroCover = document.getElementById("hero-cover");
const heroAvatarImage = document.getElementById("hero-avatar-image");
const heroTitle = document.getElementById("hero-title");
const heroSignature = document.getElementById("hero-signature");
const detailNav = document.getElementById("detail-nav");
const toolbarBack = document.getElementById("toolbar-back");
const viewer = document.getElementById("viewer");
const viewerBody = document.getElementById("viewer-body");
const viewerClose = document.getElementById("viewer-close");
const viewerPrev = document.getElementById("viewer-prev");
const viewerNext = document.getElementById("viewer-next");
const viewerCounter = document.getElementById("viewer-counter");
const viewerThumbs = document.getElementById("viewer-thumbs");
const toastHost = document.getElementById("toast-host");

const state = {
  moments: new Map(),
  likes: readStorage("momentCircle.likes", {}),
  currentUser: null,
  commentWidgetReady: false,
  commentWidgetPromise: null,
  viewer: {
    images: [],
    index: 0,
    previousOverflow: "",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  bindViewer();
  bindGlobalEvents();
  boot().catch((error) => {
    console.error(error);
    renderError(`瞬间页面加载失败：${escapeHtml(error.message || "未知错误")}`);
  });
});

function bindGlobalEvents() {
  const refresh = () => {
    const names = Array.from(state.moments.keys());
    if (!names.length) {
      return;
    }
    Promise.allSettled(
      names.map(async (name) => {
        await refreshMoment(name);
        await loadFeedActivity(name);
      })
    ).catch((error) => {
      console.warn(error);
    });
  };
  window.addEventListener("halo:comment:created", refresh);
  window.addEventListener("halo:comment-reply:created", refresh);
}

async function boot() {
  const config = normalizeConfig(await getJson(APP.configEndpoint));
  await loadCurrentUser();
  applyPageConfig(config);

  const route = resolveRoute();
  if (route.view === "detail") {
    detailNav.classList.remove("is-hidden");
    toolbarBack.href = HOME_PATH;
    tagStrip.classList.add("is-hidden");
    await renderDetailPage(route.name, config);
    return;
  }

  detailNav.classList.add("is-hidden");
  renderTagStrip(config.tags, route.tag);
  await renderListPage(route.page, route.tag, config);
}

async function loadCurrentUser() {
  try {
    const detail = await getJson(CURRENT_USER_ENDPOINT);
    const user = detail?.user || detail;
    const spec = user?.spec || {};
    const metadata = user?.metadata || {};
    const displayName = String(spec.displayName || metadata.name || "").trim();
    if (!displayName) {
      return;
    }
    state.currentUser = {
      displayName,
      avatar: String(spec.avatar || "").trim(),
      email: String(spec.email || "").trim(),
      name: String(metadata.name || displayName).trim(),
    };
  } catch (_) {
    state.currentUser = null;
  }
}

function resolveRoute() {
  const pathname =
    (window.location.pathname || HOME_PATH).replace(/\/+$/, "") || HOME_PATH;
  const tag = new URLSearchParams(window.location.search).get("tag") || "";
  const prefixes = [HOME_PATH, "/friend-circle", "/plugins/moment-circle/view"];

  for (const prefix of prefixes) {
    if (pathname === prefix || pathname === "") {
      return { view: "list", page: 1, tag };
    }

    const pageMatch = pathname.match(
      new RegExp(`^${escapeRegExp(prefix)}/page/(\\d+)$`)
    );
    if (pageMatch) {
      return { view: "list", page: Number(pageMatch[1]) || 1, tag };
    }

    if (pathname.startsWith(`${prefix}/`)) {
      return {
        view: "detail",
        name: decodeURIComponent(pathname.slice(prefix.length + 1)),
        tag,
      };
    }
  }

  return { view: "list", page: 1, tag };
}

async function renderListPage(page, tag, config) {
  root.className = "moments-feed";

  const url = new URL(`${APP.apiBase}/moments`, window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(config.pageSize));
  if (tag) {
    url.searchParams.set("tag", tag);
  }

  const result = await getJson(url.toString());
  const items = Array.isArray(result.items) ? result.items : [];

  items.forEach(cacheMoment);
  document.title = tag ? `${tag} - ${config.title}` : config.title;

  if (!items.length) {
    root.innerHTML = `<section class="empty-panel"><h2>这里还没有内容</h2><p>${
      tag
        ? `标签 #${escapeHtml(tag)} 下暂时没有瞬间。`
        : "先去后台发布一条瞬间试试看吧。"
    }</p></section>`;
    return;
  }

  root.innerHTML = `${items.map(renderMomentCard).join("")}${renderPager(
    result,
    tag
  )}`;
  bindPage();
  await Promise.allSettled(items.map((moment) => loadFeedActivity(nameOf(moment))));
}

async function renderDetailPage(name, config) {
  root.className = "moments-feed single-view";

  const moment = await getJson(`${APP.apiBase}/moments/${encodeURIComponent(name)}`);
  cacheMoment(moment);
  document.title = `${deriveMomentTitle(moment)} - ${config.title}`;

  root.innerHTML = `<article class="single-article"><div class="article-body"><header class="article-header"><h1 class="article-title">${escapeHtml(
    deriveMomentTitle(moment)
  )}</h1><div class="article-meta"><span>${escapeHtml(
    moment.owner?.displayName || moment.owner?.name || "匿名用户"
  )}</span><span class="meta-dot">·</span><span>${formatDateTime(
    moment.spec?.releaseTime
  )}</span></div></header><div class="article-text">${renderRaw(
    moment.spec?.content?.html,
    moment.spec?.content?.raw
  )}</div>${renderDetailGallery(moment)}<div class="article-extra"><span data-upvote-label="${ea(
    nameOf(moment)
  )}">赞 ${Number(moment.stats?.upvote || 0)}</span><span data-comment-label="${ea(
    nameOf(moment)
  )}">评 ${Number(moment.stats?.approvedComment || 0)}</span>${renderTagText(
    moment.spec?.tags
  )}</div><section class="detail-comments" id="comments"><div class="detail-comments-header"><h2 class="detail-comments-title">评论</h2></div><div class="comment-widget-card" data-detail-widget="${ea(
    nameOf(moment)
  )}"><section class="loading-panel"><div class="loading-panel__glow"></div><p>评论组件加载中...</p></section></div></section></div></article>`;

  bindPage();
  await mountCommentWidget(
    nameOf(moment),
    find(`[data-detail-widget="${sel(nameOf(moment))}"]`),
    false
  );
}

function renderMomentCard(moment) {
  const name = nameOf(moment);
  const owner = eh(moment.owner?.displayName || moment.owner?.name || "匿名用户");
  const avatar =
    moment.owner?.avatar ||
    fallbackAvatar(moment.owner?.displayName || moment.owner?.name || "瞬");
  const detailLink = `${HOME_PATH}/${encodeURIComponent(name)}`;

  return `<article class="moment-card" id="moment-${ea(
    name
  )}"><aside class="moment-aside"><a class="avatar-link" href="${detailLink}"><img class="avatar-img" src="${ea(
    avatar
  )}" alt="${owner}" loading="lazy"></a></aside><div class="moment-body"><h2 class="moment-author"><a href="${detailLink}">${owner}</a></h2><div class="moment-text-wrapper"><div class="moment-text is-collapsed">${renderRaw(
    moment.spec?.content?.html,
    moment.spec?.content?.raw
  )}</div><button class="text-toggle" type="button">全文</button></div>${renderFeedGallery(
    photosOf(moment)
  )}${renderMediaStack(otherMediaOf(moment))}<footer class="moment-footer"><div class="footer-meta"><span class="moment-time">${formatDate(
    moment.spec?.releaseTime
  )}</span>${renderTags(moment.spec?.tags)}</div><div class="footer-actions moment-actions"><span class="moment-stat" data-upvote-label="${ea(
    name
  )}">赞 ${Number(moment.stats?.upvote || 0)}</span><span class="moment-stat" data-comment-label="${ea(
    name
  )}">评 ${Number(moment.stats?.approvedComment || 0)}</span><button class="moment-action-btn ${
    liked(name) ? "is-liked" : ""
  }" type="button" data-action="like" data-name="${ea(name)}">${
    liked(name) ? "已赞" : "点赞"
  }</button><button class="moment-action-btn" type="button" data-action="comment" data-name="${ea(
    name
  )}">评论</button><a class="moment-detail-link" href="${detailLink}">详情</a></div></footer><div class="moment-comments-area feed-comments" data-feed-comments="${ea(
    name
  )}"></div><div class="feed-comment-panel is-hidden" data-feed-editor="${ea(
    name
  )}"><section class="loading-panel"><div class="loading-panel__glow"></div><p>评论组件待展开...</p></section></div></div></article>`;
}

function bindPage() {
  bindToggles();
  bindViewerTargets();
  bindLikes();
  bindCommentButtons();
  syncDisplays();
}

function bindToggles() {
  root.querySelectorAll(".moment-text-wrapper").forEach((wrapper) => {
    const textNode = wrapper.querySelector(".moment-text");
    const button = wrapper.querySelector(".text-toggle");
    if (!textNode || !button) {
      return;
    }
    if (textNode.scrollHeight > textNode.clientHeight + 8) {
      button.style.display = "inline-block";
      button.onclick = () => {
        const collapsed = textNode.classList.toggle("is-collapsed");
        button.textContent = collapsed ? "全文" : "收起";
      };
    }
  });
}

function bindViewerTargets() {
  root.querySelectorAll("[data-viewer-list]").forEach((image) => {
    image.addEventListener("click", () => {
      const list = parseViewerList(image.getAttribute("data-viewer-list"));
      if (!list.length) {
        return;
      }
      openViewer(list, Number(image.getAttribute("data-viewer-index") || 0));
    });
  });
}

function bindLikes() {
  root.querySelectorAll('[data-action="like"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();

      const name = button.getAttribute("data-name") || "";
      if (!name || button.disabled) {
        return;
      }

      button.disabled = true;
      const alreadyLiked = liked(name);

      try {
        await postJson(
          `${METRICS_API_BASE}/${alreadyLiked ? "downvote" : "upvote"}`,
          {
            group: "moment.halo.run",
            plural: "moments",
            name,
          },
          false
        );
        setLiked(name, !alreadyLiked);
        adjustUpvote(name, alreadyLiked ? -1 : 1);
        syncOne(name);
        showToast(alreadyLiked ? "已取消点赞" : "点赞成功");
        await refreshMoment(name);
        await loadFeedActivity(name);
      } catch (error) {
        console.error(error);
        showToast(error.message || "点赞失败");
      }

      button.disabled = false;
    });
  });
}

function bindCommentButtons() {
  root.querySelectorAll('[data-action="comment"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();

      const name = button.getAttribute("data-name") || "";
      const panel = find(`[data-feed-editor="${sel(name)}"]`);
      if (!panel) {
        window.location.href = `${HOME_PATH}/${encodeURIComponent(name)}#comments`;
        return;
      }

      const willOpen = panel.classList.contains("is-hidden");
      document.querySelectorAll("[data-feed-editor]").forEach((node) => {
        if (node !== panel) {
          node.classList.add("is-hidden");
        }
      });

      if (!willOpen) {
        panel.classList.add("is-hidden");
        return;
      }

      panel.classList.remove("is-hidden");
      const mounted = await mountCommentWidget(name, panel, true);
      if (mounted) {
        await focusCommentWidget(panel);
      }
    });
  });
}

async function mountCommentWidget(name, host, compact) {
  if (!host) {
    return false;
  }

  if (host.dataset.mounted === "true" && host.querySelector("comment-widget")) {
    return true;
  }

  host.innerHTML = `<section class="loading-panel"><div class="loading-panel__glow"></div><p>官方评论组件加载中...</p></section>`;
  const ready = await ensureCommentWidget();
  if (!ready) {
    host.innerHTML = `<section class="error-panel"><h2>评论组件加载失败</h2><p>请稍后刷新页面重试。</p></section>`;
    return false;
  }

  host.innerHTML = `<div class="comment-widget-shell${
    compact ? " is-compact" : ""
  }"><comment-widget base-url="" group="moment.halo.run" kind="Moment" version="v1alpha1" name="${ea(
    name
  )}"></comment-widget></div>`;
  host.dataset.mounted = "true";
  return true;
}

async function focusCommentWidget(host) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const widget = host.querySelector("comment-widget");
    const commentForm = widget?.shadowRoot?.querySelector("comment-form");
    const baseForm = commentForm?.shadowRoot?.querySelector("base-form");
    if (baseForm && typeof baseForm.setFocus === "function") {
      baseForm.setFocus();
      return;
    }
    await wait(120);
  }
}

async function ensureCommentWidget() {
  if (state.commentWidgetReady || customElements.get("comment-widget")) {
    patchCommentWidgetComponents();
    state.commentWidgetReady = true;
    return true;
  }

  if (state.commentWidgetPromise) {
    return state.commentWidgetPromise;
  }

  state.commentWidgetPromise = loadCommentWidgetModule()
    .then(() => {
      patchCommentWidgetComponents();
      state.commentWidgetReady = !!customElements.get("comment-widget");
      return state.commentWidgetReady;
    })
    .catch((error) => {
      console.error(error);
      state.commentWidgetReady = false;
      showToast("官方评论组件加载失败");
      return false;
    })
    .finally(() => {
      state.commentWidgetPromise = null;
    });

  return state.commentWidgetPromise;
}

async function loadCommentWidgetModule() {
  if (customElements.get("comment-widget")) {
    return;
  }

  let lastError = null;
  for (const url of COMMENT_WIDGET_MODULES) {
    try {
      await loadModuleScript(url);
      if (customElements.get("comment-widget")) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("无法加载官方评论组件");
}

function loadModuleScript(src) {
  return new Promise((resolve, reject) => {
    const existing = findAll("script[data-comment-widget-src]").find(
      (node) => node.dataset.commentWidgetSrc === src
    );

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`无法加载模块：${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.async = true;
    script.src = src;
    script.dataset.commentWidgetSrc = src;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error(`无法加载模块：${src}`));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });
}

function patchCommentWidgetComponents() {
  const widgetCtor = customElements.get("comment-widget");
  if (widgetCtor && !widgetCtor.prototype.__momentCirclePatched) {
    const originalFetchGlobalInfo = widgetCtor.prototype.fetchGlobalInfo;
    const originalFetchCurrentUser = widgetCtor.prototype.fetchCurrentUser;

    widgetCtor.prototype.fetchGlobalInfo = async function () {
      try {
        await originalFetchGlobalInfo.call(this);
      } catch (_) {
        this.allowAnonymousComments = true;
      }
    };

    widgetCtor.prototype.fetchConfigMapData = async function () {
      this.configMapData = buildCommentWidgetConfig();
    };

    widgetCtor.prototype.fetchCurrentUser = async function () {
      try {
        await originalFetchCurrentUser.call(this);
      } catch (_) {
        this.currentUser = undefined;
      }
    };

    widgetCtor.prototype.__momentCirclePatched = true;
  }

  const baseFormCtor = customElements.get("base-form");
  if (baseFormCtor && !baseFormCtor.prototype.__momentCirclePatched) {
    const originalConnectedCallback = baseFormCtor.prototype.connectedCallback;
    const originalUpdated = baseFormCtor.prototype.updated;

    baseFormCtor.prototype.connectedCallback = function () {
      originalConnectedCallback.call(this);
      window.setTimeout(() => {
        decorateCommentBaseForm(this);
      }, 0);
    };

    baseFormCtor.prototype.updated = function (changedProperties) {
      if (typeof originalUpdated === "function") {
        originalUpdated.call(this, changedProperties);
      }
      decorateCommentBaseForm(this);
    };

    baseFormCtor.prototype.onSubmit = function (event) {
      event.preventDefault();

      const form = event.target;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const isAnonymous = !this.currentUser && this.allowAnonymousComments;

      if (isAnonymous) {
        data.displayName = String(data.displayName || "").trim();
        data.email = String(data.email || "").trim() || guestEmail(data.displayName);
        data.website = "";
      }

      localStorage.setItem(
        "halo-comment-custom-account",
        JSON.stringify({
          displayName: isAnonymous ? data.displayName || "" : "",
          email: "",
          website: "",
        })
      );

      this.debouncedSubmit(data);
    };

    baseFormCtor.prototype.__momentCirclePatched = true;
  }
}

function decorateCommentBaseForm(formElement) {
  const shadow = formElement?.shadowRoot;
  if (!shadow) {
    return;
  }

  ensureShadowStyle(
    shadow,
    "moment-circle-base-form-style",
    `.form-inputs{grid-template-columns:minmax(0,1fr)!important;}.form-login-link,input[name="email"],input[name="website"]{display:none!important;}.form-account{gap:.75rem!important;}.form-account-avatar.avatar{width:2.5rem!important;height:2.5rem!important;border-radius:999px!important;overflow:hidden;}.form-account-avatar.avatar img{width:100%;height:100%;object-fit:cover;}.form__footer{align-items:center;gap:1rem!important;}.form-account-name{font-size:1rem!important;}`
  );

  const displayNameInput = shadow.querySelector('input[name="displayName"]');
  if (displayNameInput) {
    displayNameInput.placeholder = "昵称";
    displayNameInput.maxLength = 32;
    displayNameInput.autocomplete = "nickname";
  }

  const emailInput = shadow.querySelector('input[name="email"]');
  if (emailInput) {
    emailInput.required = false;
    emailInput.value = "";
    emailInput.tabIndex = -1;
    emailInput.setAttribute("aria-hidden", "true");
  }

  const websiteInput = shadow.querySelector('input[name="website"]');
  if (websiteInput) {
    websiteInput.value = "";
    websiteInput.tabIndex = -1;
    websiteInput.setAttribute("aria-hidden", "true");
  }

  const accountName = shadow.querySelector(".form-account-name");
  if (accountName && formElement.currentUser) {
    accountName.textContent =
      formElement.currentUser?.spec?.displayName ||
      formElement.currentUser?.metadata?.name ||
      accountName.textContent;
  }
}

function buildCommentWidgetConfig() {
  return {
    basic: {
      size: 20,
      withReplies: true,
      replySize: 10,
      enablePrivateComment: false,
    },
    editor: {
      placeholder: "说点什么吧...",
    },
    security: {
      captcha: {
        anonymousCommentCaptcha: false,
      },
    },
    avatar: {
      enable: false,
      provider: "gravatar",
      providerMirror: "",
      policy: "anonymousUser",
    },
  };
}

function guestEmail(displayName) {
  const seed = encodeURIComponent(String(displayName || "guest").trim())
    .replace(/%/g, "")
    .slice(0, 24);
  return `${seed || `guest${Date.now()}`}@moment.local`;
}

async function refreshMoment(name) {
  try {
    const moment = await getJson(`${APP.apiBase}/moments/${encodeURIComponent(name)}`);
    cacheMoment(moment);
    syncOne(name);
  } catch (error) {
    console.warn(error);
  }
}

async function loadFeedActivity(name) {
  const box = find(`[data-feed-comments="${sel(name)}"]`);
  const moment = state.moments.get(name);
  if (!box || !moment) {
    return;
  }

  try {
    const result = await loadComments(name, 1, 3, 1);
    const items = Array.isArray(result.items) ? result.items : [];
    const likeCount = Number(moment.stats?.upvote || 0);

    if (!likeCount && !items.length) {
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    box.innerHTML = `${
      likeCount
        ? `<div class="moment-likes"><span class="moment-likes-icon">❤</span><span class="moment-likes-text" data-like-summary="${ea(
            name
          )}">${eh(likeText(name, likeCount))}</span></div>`
        : ""
    }${
      items.length
        ? `<div class="wechat-comments-list">${items
            .slice(0, 3)
            .map(
              (comment) =>
                `<div class="wechat-comment-item"><div class="wechat-main"><span class="wechat-nick">${eh(
                  comment.owner?.displayName || comment.owner?.name || "游客"
                )}</span><span class="wechat-colon">：</span><span class="wechat-content">${eh(
                  trim(strip(comment.spec?.content || comment.spec?.raw || ""), 90)
                )}</span></div><span class="wechat-time">${relativeTime(
                  comment.spec?.creationTime
                )}</span></div>`
            )
            .join("")}</div>`
        : ""
    }`;
    box.style.display = "block";
  } catch (error) {
    console.warn(error);
    if (Number(moment.stats?.upvote || 0) > 0) {
      box.innerHTML = `<div class="moment-likes"><span class="moment-likes-icon">❤</span><span class="moment-likes-text" data-like-summary="${ea(
        name
      )}">${eh(likeText(name, Number(moment.stats?.upvote || 0)))}</span></div>`;
      box.style.display = "block";
    }
  }
}

async function loadComments(name, page, size, replySize) {
  const url = new URL(COMMENT_API_BASE, window.location.origin);
  url.searchParams.set("version", "v1alpha1");
  url.searchParams.set("kind", "Moment");
  url.searchParams.set("group", "moment.halo.run");
  url.searchParams.set("name", name);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));
  url.searchParams.set("withReplies", "true");
  url.searchParams.set("replySize", String(replySize));
  return getJson(url.toString());
}

function cacheMoment(moment) {
  state.moments.set(nameOf(moment), moment);
}

function syncDisplays() {
  Array.from(state.moments.keys()).forEach(syncOne);
}

function syncOne(name) {
  const moment = state.moments.get(name);
  if (!moment) {
    return;
  }

  findAll(`[data-upvote-label="${sel(name)}"]`).forEach((node) => {
    node.textContent = `赞 ${Number(moment.stats?.upvote || 0)}`;
  });
  findAll(`[data-comment-label="${sel(name)}"]`).forEach((node) => {
    node.textContent = `评 ${Number(moment.stats?.approvedComment || 0)}`;
  });
  findAll(`[data-like-summary="${sel(name)}"]`).forEach((node) => {
    node.textContent = likeText(name, Number(moment.stats?.upvote || 0));
  });
  findAll(`[data-name="${sel(name)}"]`)
    .filter((node) => node.matches('[data-action="like"]'))
    .forEach((node) => {
      const active = liked(name);
      node.classList.toggle("is-liked", active);
      node.textContent = active ? "已赞" : "点赞";
    });
}

function adjustUpvote(name, delta) {
  const moment = state.moments.get(name);
  if (!moment) {
    return;
  }
  moment.stats = moment.stats || {};
  moment.stats.upvote = Math.max(0, Number(moment.stats.upvote || 0) + delta);
}

function likeText(name, count) {
  if (count <= 0) {
    return "";
  }
  if (!liked(name)) {
    return `已有 ${count} 人点赞`;
  }
  return count === 1 ? "你觉得很赞" : `你和其他 ${count - 1} 人觉得很赞`;
}

function applyPageConfig(config) {
  document.documentElement.style.setProperty("--theme-color", config.accentColor);
  heroTitle.textContent = config.profileName;
  heroSignature.textContent = config.signature;
  heroSignature.style.display = config.signature ? "" : "none";
  footer.textContent = config.footerText;
  heroAvatarImage.src = config.avatarUrl || fallbackAvatar(config.profileName || "瞬");
  heroCover.style.backgroundImage = config.coverUrl
    ? `url("${ea(config.coverUrl)}")`
    : "linear-gradient(120deg, #89d5aa 0%, #07c160 100%)";
}

function renderTagStrip(tags, currentTag) {
  const list = Array.isArray(tags) ? tags : [];
  if (!list.length) {
    tagStrip.classList.add("is-hidden");
    return;
  }

  tagStrip.classList.remove("is-hidden");
  tagStrip.innerHTML = [
    `<a class="tag-pill ${currentTag ? "" : "is-active"}" href="${buildListUrl(
      1,
      ""
    )}">全部</a>`,
    ...list.map(
      (tag) =>
        `<a class="tag-pill ${
          currentTag === tag.name ? "is-active" : ""
        }" href="${buildListUrl(1, tag.name)}"><span>#${eh(
          tag.name || ""
        )}</span><span>${Number(tag.momentCount || 0)}</span></a>`
    ),
  ].join("");
}

function renderPager(result, tag) {
  if (!result.totalPages || result.totalPages <= 1) {
    return "";
  }

  return `<section class="empty-panel">${
    result.hasPrevious
      ? `<a class="moment-detail-link" href="${buildListUrl(
          result.page - 1,
          tag
        )}">上一页</a>`
      : ""
  }<span>第 ${result.page} / ${result.totalPages} 页</span>${
    result.hasNext
      ? `<a class="moment-detail-link" href="${buildListUrl(
          result.page + 1,
          tag
        )}">下一页</a>`
      : ""
  }</section>`;
}

function renderFeedGallery(list) {
  if (!list.length) {
    return "";
  }

  const viewerList = ea(JSON.stringify(list));
  if (list.length === 1) {
    return `<div class="moment-gallery"><div class="gallery-single"><img data-viewer-list="${viewerList}" data-viewer-index="0" src="${ea(
      list[0]
    )}" alt="瞬间图片" loading="lazy"></div></div>`;
  }

  const gridClass = list.length === 2 || list.length === 4 ? "cols-2" : "cols-3";
  return `<div class="moment-gallery"><div class="gallery-grid ${gridClass}">${list
    .map(
      (image, index) =>
        `<div class="gallery-item"><img data-viewer-list="${viewerList}" data-viewer-index="${index}" src="${ea(
          image
        )}" alt="瞬间图片" loading="lazy"></div>`
    )
    .join("")}</div></div>`;
}

function renderDetailGallery(moment) {
  const list = photosOf(moment);
  const media = otherMediaOf(moment);
  const viewerList = ea(JSON.stringify(list));

  return `${
    list.length
      ? `<div class="article-gallery">${list
          .map(
            (image, index) =>
              `<figure class="article-image"><img data-viewer-list="${viewerList}" data-viewer-index="${index}" src="${ea(
                image
              )}" alt="瞬间图片" loading="lazy"></figure>`
          )
          .join("")}</div>`
      : ""
  }${renderMediaStack(media)}`;
}

function renderMediaStack(items) {
  if (!items.length) {
    return "";
  }

  return `<div class="moment-media-stack">${items
    .map((item) => {
      if (item.type === "VIDEO") {
        return `<video controls preload="metadata" src="${ea(item.url || "")}"></video>`;
      }
      if (item.type === "AUDIO") {
        return `<audio controls preload="metadata" src="${ea(item.url || "")}"></audio>`;
      }
      return "";
    })
    .join("")}</div>`;
}

function renderTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  return list.length
    ? `<span class="moment-tags">${list
        .map(
          (tag) =>
            `<a class="moment-tag" href="${buildListUrl(1, tag)}">#${eh(tag)}</a>`
        )
        .join("")}</span>`
    : "";
}

function renderTagText(tags) {
  const list = Array.isArray(tags) ? tags : [];
  return list.length ? `<span>${list.map((tag) => `#${eh(tag)}`).join(" ")}</span>` : "";
}

function renderRaw(html, raw) {
  return html && String(html).trim()
    ? html
    : `<p>${eh(raw || "这条瞬间暂时没有正文。").replace(/\n/g, "<br>")}</p>`;
}

function photosOf(moment) {
  return mediaOf(moment)
    .filter((item) => item.type === "PHOTO")
    .map((item) => item.url)
    .filter(Boolean);
}

function otherMediaOf(moment) {
  return mediaOf(moment).filter((item) => item.type !== "PHOTO");
}

function mediaOf(moment) {
  const content = moment?.spec?.content;
  return Array.isArray(content?.medium) ? content.medium : [];
}

function normalizeConfig(config) {
  return {
    title: config?.title || "瞬间",
    pageSize: Number(config?.pageSize || 10),
    profileName: config?.profileName || "恪勤",
    signature: config?.signature || "",
    avatarUrl: config?.avatarUrl || "",
    coverUrl: config?.coverUrl || "",
    footerText: config?.footerText || "由 Halo 瞬间插件驱动",
    accentColor: config?.accentColor || "#07c160",
    tags: Array.isArray(config?.tags) ? config.tags : [],
  };
}

function deriveMomentTitle(moment) {
  const text = strip(moment?.spec?.content?.html || moment?.spec?.content?.raw || "")
    .trim();
  if (!text) {
    return formatDateTime(moment?.spec?.releaseTime);
  }
  return text.length > 32 ? `${text.slice(0, 32)}...` : text;
}

function buildListUrl(page, tag) {
  const path = page > 1 ? `${HOME_PATH}/page/${page}` : HOME_PATH;
  return tag ? `${path}?tag=${encodeURIComponent(tag)}` : path;
}

function bindViewer() {
  if (!viewer) {
    return;
  }

  viewerClose?.addEventListener("click", closeViewer);
  viewerPrev?.addEventListener("click", () => stepViewer(-1));
  viewerNext?.addEventListener("click", () => stepViewer(1));
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) {
      closeViewer();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (viewer.classList.contains("is-hidden")) {
      return;
    }
    if (event.key === "Escape") {
      closeViewer();
    } else if (event.key === "ArrowLeft") {
      stepViewer(-1);
    } else if (event.key === "ArrowRight") {
      stepViewer(1);
    }
  });
}

function parseViewerList(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function openViewer(images, index) {
  if (!Array.isArray(images) || !images.length) {
    return;
  }
  state.viewer.images = images.filter(Boolean);
  state.viewer.index = clamp(index, 0, state.viewer.images.length - 1);
  state.viewer.previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  renderViewer();
  viewer.classList.remove("is-hidden");
  viewer.setAttribute("aria-hidden", "false");
}

function renderViewer() {
  const total = state.viewer.images.length;
  if (!total) {
    return;
  }

  const current = state.viewer.images[state.viewer.index];
  viewerBody.innerHTML = `<img src="${ea(current)}" alt="瞬间预览大图">`;
  viewerCounter.textContent = `${state.viewer.index + 1} / ${total}`;
  viewerPrev.disabled = total <= 1;
  viewerNext.disabled = total <= 1;
  viewerThumbs.innerHTML =
    total > 1
      ? state.viewer.images
          .map(
            (image, index) =>
              `<button class="viewer__thumb ${
                index === state.viewer.index ? "is-active" : ""
              }" type="button" data-viewer-thumb="${index}"><img src="${ea(
                image
              )}" alt="预览缩略图"></button>`
          )
          .join("")
      : "";
  viewerThumbs
    .querySelectorAll("[data-viewer-thumb]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        state.viewer.index = Number(button.getAttribute("data-viewer-thumb") || 0);
        renderViewer();
      })
    );
}

function stepViewer(delta) {
  const total = state.viewer.images.length;
  if (total <= 1) {
    return;
  }
  state.viewer.index = (state.viewer.index + delta + total) % total;
  renderViewer();
}

function closeViewer() {
  viewer.classList.add("is-hidden");
  viewer.setAttribute("aria-hidden", "true");
  viewerBody.innerHTML = "";
  viewerCounter.textContent = "";
  viewerThumbs.innerHTML = "";
  state.viewer.images = [];
  state.viewer.index = 0;
  document.body.style.overflow = state.viewer.previousOverflow || "";
}

async function getJson(url) {
  return request(url, { method: "GET" }, true);
}

async function postJson(url, body, json = true) {
  return request(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    json
  );
}

async function request(url, options, expectJson) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    throw new Error(await readErr(response));
  }
  if (!expectJson) {
    return null;
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : null;
}

async function readErr(response) {
  const fallback = `Request failed: ${response.status}`;
  try {
    const text = await response.text();
    if (!text) {
      return fallback;
    }
    try {
      const data = JSON.parse(text);
      return data.message || data.detail || data.title || data.error || fallback;
    } catch (_) {
      return text.length > 160 ? fallback : text;
    }
  } catch (_) {
    return fallback;
  }
}

function showToast(message) {
  if (!toastHost || !message) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastHost.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2400);
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function liked(name) {
  return !!state.likes?.[name];
}

function setLiked(name, on) {
  state.likes = state.likes || {};
  if (on) {
    state.likes[name] = true;
  } else {
    delete state.likes[name];
  }
  writeStorage("momentCircle.likes", state.likes);
}

function nameOf(moment) {
  return moment?.metadata?.name || "";
}

function fallbackAvatar(text) {
  const character = (text || "瞬").trim().slice(0, 1) || "瞬";
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%"><stop stop-color="#7bcfa5" offset="0%"/><stop stop-color="#07c160" offset="100%"/></linearGradient></defs><rect width="120" height="120" rx="18" fill="url(#g)"/><text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="56" fill="#ffffff">${eh(
      character
    )}</text></svg>`
  )}`;
}

function formatDate(value) {
  if (!value) {
    return "刚刚";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "刚刚";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function relativeTime(value) {
  if (!value) {
    return "刚刚";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "刚刚";
  }
  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  }
  if (diff < day) {
    return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  }
  if (diff < day * 2) {
    return "昨天";
  }
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function trim(value, max) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function strip(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function renderError(message) {
  root.innerHTML = `<section class="error-panel"><h2>加载失败</h2><p>${eh(
    message
  )}</p></section>`;
}

function ensureShadowStyle(shadowRoot, id, cssText) {
  if (shadowRoot.getElementById(id)) {
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssText;
  shadowRoot.appendChild(style);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function find(selector) {
  return document.querySelector(selector);
}

function findAll(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function eh(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ea(value) {
  return eh(value).replaceAll("`", "&#96;");
}

function sel(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}

function escapeHtml(value) {
  return eh(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
