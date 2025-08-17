// GPT Burger v1.3.5
console.log("🍔 GPT Burger content script loaded. Version 1.3.5");

console.log(
    "%c 🍔 GPT BURGER SCRIPT ATTEMPTING TO LOAD (v1.3.5) 🍔 %c If you see this, the new script is loading. If not, the extension needs a manual reload from chrome://extensions.",
    "background: #ffcc00; color: #333; font-size: 14px; font-weight: bold; padding: 5px;",
    "background: #f0f0f0; color: #333; padding: 5px;"
);

// 🔧 用户设置
const USER_SETTINGS = {
    enableHoverExpand: true,  // 是否启用悬停展开功能
    hoverDelay: 0,            // 悬停延迟时间（毫秒）- 改为立即显示
    // 新功能开关：烘焙（新导出流程）
    enableBakeFlow: true,
    // 深色模式总开关（发布前暂时关闭）
    enableDarkMode: false
};

// 🌐 全局语言覆盖变量（使用 var 避免 TDZ 问题）
// 说明：i18n 在文件早期会被调用，若使用 let 声明且在文件后部赋值，会触发 TDZ。
// 使用 var 可保证在任何调用点都已存在（值为 null）。
var GPTB_LANG_OVERRIDE = null; // 'system' | 'en' | 'zh_CN'
var GPTB_I18N_CACHE = null;    // { key: message }

// 🔵 获取当前页面的对话 ID
function getCurrentChatId() {
  // 🛠️ ChatGPT 每个聊天地址都有 /c/xxx 格式
  const match = window.location.pathname.match(/\/c\/([\w-]+)/);
  return match ? match[1] : "default"; // 💡 没找到时用 fallback
}

// 🔵 所有书签数据储存在这个变量中
let lastBookmarkId = null;
let allBookmarks = {}; // 🛠️ 结构：{ chatId1: [书签数组], chatId2: [...] }
let currentChatId = getCurrentChatId(); // 🔵 当前对话的唯一标识（从网址中提取）
let bookmarkIdCounter = 0; // 🔵 自动编号书签锚点
let isManageMode = false; // 🔵 管理模式状态
let selectedBookmarks = new Set(); // 🔵 选中的书签集合
let selectedGroups = new Set(); // 🔵 选中的分组集合
let tempBookmark = null; // 🔵 临时书签变量
let gptBurgerRoot = null; // 🍔 所有UI元素的根容器

// 悬停展开相关变量
let hoverTimeout = null;
let isHoveringButton = false;
let isHoveringList = false;
let isHoveringDock = false; // 语言切换按钮区域悬停

// 拖拽状态全局标记（用于屏蔽内部滚动等误触）
let isDraggingBookmarkGlobal = false;

// 预设的颜色分组 - 4个颜色分组匹配4种背景色
const DEFAULT_COLOR_GROUPS = ['1', '2', '3', '4'];

// 🆕 拖拽模式状态
let isSortByGroup = false; // false: 按添加顺序显示，true: 按分组排序显示

// 🔵 从 localStorage 读取书签数据
function loadBookmarksFromStorage() {
  const saved = localStorage.getItem("gptBookmarks");
  if (saved) {
        allBookmarks = JSON.parse(saved);
        
        // 确保每个对话都有完整的数据结构
        for (let chatId in allBookmarks) {
            if (!allBookmarks[chatId].bookmarks) {
                allBookmarks[chatId].bookmarks = [];
            }
            
            // 确保有 groupOrder 且包含所有默认分组
            if (!allBookmarks[chatId].groupOrder) {
                allBookmarks[chatId].groupOrder = ['', ...DEFAULT_COLOR_GROUPS];
            } else {
                // 🆕 清理旧的emoji分组，只保留数字分组和有书签的自定义分组
                const bookmarksByGroup = {};
                allBookmarks[chatId].bookmarks.forEach(bookmark => {
                    const group = bookmark.group || '';
                    if (!bookmarksByGroup[group]) {
                        bookmarksByGroup[group] = [];
                    }
                    bookmarksByGroup[group].push(bookmark);
                });
                
                // 过滤groupOrder，只保留：默认分组、数字分组、有书签的自定义分组
                const oldEmojiGroups = ['🍅', '🥬', '🧀', '🥒']; // 旧的emoji分组
                allBookmarks[chatId].groupOrder = allBookmarks[chatId].groupOrder.filter(groupName => {
                    // 保留默认分组
                    if (groupName === '') return true;
                    // 保留数字分组
                    if (DEFAULT_COLOR_GROUPS.includes(groupName)) return true;
                    // 跳过旧的emoji分组
                    if (oldEmojiGroups.includes(groupName)) return false;
                    // 保留有书签的自定义分组
                    return bookmarksByGroup[groupName] && bookmarksByGroup[groupName].length > 0;
                });
                
                // 确保默认分组在最前面
                if (!allBookmarks[chatId].groupOrder.includes('')) {
                    allBookmarks[chatId].groupOrder.unshift('');
                }
                
                // 确保包含所有预设颜色分组
                DEFAULT_COLOR_GROUPS.forEach(color => {
                    if (!allBookmarks[chatId].groupOrder.includes(color)) {
                    const defaultIndex = allBookmarks[chatId].groupOrder.indexOf('');
                        allBookmarks[chatId].groupOrder.splice(defaultIndex + 1, 0, color);
                }
                });
                
                console.log(`🔄 清理对话 ${chatId} 的分组数据:`, {
                    原有分组: Object.keys(JSON.parse(saved))[chatId]?.groupOrder || [],
                    清理后分组: allBookmarks[chatId].groupOrder
                });
            }
        }
        
        console.log("📚 从 localStorage 加载书签数据：", {
            chatIds: Object.keys(allBookmarks),
            currentChatData: allBookmarks[currentChatId],
            allData: allBookmarks
        });
        return true;
    }
    return false;
}

// 🔵 获取当前这个对话的书签数组
function getCurrentChatBookmarks() {
    const chatData = allBookmarks[currentChatId];
    if (chatData && Array.isArray(chatData.bookmarks)) {
      return chatData.bookmarks;
    }
    return [];
  }
  
// 🔵 把当前所有书签保存到 localStorage
function saveBookmarksToStorage() {
    localStorage.setItem("gptBookmarks", JSON.stringify(allBookmarks));
    console.log("💾 已写入 localStorage.gptBookmarks：", allBookmarks);
}

// 🔵 插件入口：页面加载完成后执行
function initPlugin() {
    console.log("🚀 [Debug] initPlugin: Starting initialization...");
    
    // 确保只创建一次根容器
    if (!document.getElementById('gpt-burger-root')) {
        gptBurgerRoot = document.createElement('div');
        gptBurgerRoot.id = 'gpt-burger-root';
        document.body.appendChild(gptBurgerRoot);
        console.log('🍔 GPT Burger Root created.');
    }
    
    // Add visual debug indicator
    const debugIndicator = document.createElement('div');
    debugIndicator.id = 'gpt-burger-debug-indicator';
    debugIndicator.textContent = 'GPT Burger v1.3.5 LOADED';
    document.body.appendChild(debugIndicator);
    console.log(" VISUAL DEBUG INDICATOR ADDED ");
    
    // 加载保存的书签数据
    loadBookmarksFromStorage();
    
    // 创建样式和UI
    createStyles();
    createBookmarkUI();
    
    // 创建快速操作弹窗
    createQuickActionPopup();
    
    // 等待页面加载完成后渲染书签
    waitForArticlesAndRender();
    
    // 监听主题变化
    observeThemeChanges();
    
    console.log("✅ [Debug] initPlugin: Initialization complete.");
}

// 监听主题变化
function observeThemeChanges() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class' && mutation.target === document.documentElement) {
                console.log("👀 检测到 HTML 类变化，可能是主题切换");
                handleThemeChange();
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
    });

    console.log("🎭 主题监听器已启动");
}

// ✅ 等待页面上的 article 加载完成后再渲染书签
function waitForArticlesAndRender() {
    console.log("👀 等待页面加载...");
    
    // 确保书签列表容器存在
    if (!document.getElementById('gpt-bookmark-list')) {
        console.log("⚠️ 书签列表容器不存在，重新创建");
        createBookmarkUI();
    }
    
    const articles = document.querySelectorAll("article");
    if (articles.length > 0) {
        console.log("✅ 页面已加载，开始渲染书签");
        renderBookmarkList();
        return;
    }

    console.log("⏳ 页面未加载完成，开始监听...");
    const observer = new MutationObserver(() => {
        const articles = document.querySelectorAll("article");
        if (articles.length > 0) {
            observer.disconnect(); // 🔚 停止监听
            console.log("✅ 检测到页面加载完成，开始渲染书签");
            
            // 再次确保书签列表容器存在
            if (!document.getElementById('gpt-bookmark-list')) {
                console.log("⚠️ 书签列表容器不存在，重新创建");
                createBookmarkUI();
            }
            
            renderBookmarkList();
        }
    });

    // 👂监听页面变化，直到 article 元素出现
    observer.observe(document.body, { childList: true, subtree: true });
}

// 创建基础UI
function createBookmarkUI() {
    console.log("🎨 [Debug] createBookmarkUI: Starting UI creation...");
    
    // 检查是否已存在切换按钮，如果存在则移除旧的
    const existingToggle = document.getElementById('gpt-bookmark-toggle');
    if (existingToggle) {
        console.log("🗑️ [Debug] createBookmarkUI: Removing existing toggle button.");
        existingToggle.remove();
    }
    
    // 检查是否已存在书签列表，如果存在则移除旧的
    const existingList = document.getElementById('gpt-bookmark-list');
    if (existingList) {
        console.log("🗑️ [Debug] createBookmarkUI: Removing existing bookmark list.");
        existingList.remove();
    }
    
    // 创建折叠切换按钮
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "gpt-bookmark-toggle";
    toggleBtn.id = "gpt-bookmark-toggle";
    toggleBtn.innerHTML = "";
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'gptb-toggle-icon';
    try {
        const iconUrl = chrome.runtime.getURL('icons/icon48.png');
        toggleIcon.style.backgroundImage = `url(${iconUrl})`;
        toggleIcon.style.backgroundSize = 'contain';
        toggleIcon.style.backgroundRepeat = 'no-repeat';
        toggleIcon.style.backgroundPosition = 'center';
    } catch (_) {}
    toggleBtn.appendChild(toggleIcon);
    toggleBtn.title = "展开书签";

    // 语言容器（位于 toggle 下方）
    const langDock = document.createElement('div');
    langDock.className = 'lang-switch-container collapsed';
    const langBtnDock = document.createElement('button');
    langBtnDock.className = 'lang-switch';
    // 英文界面显示"中"，中文界面显示"EN"
    langBtnDock.textContent = getEffectiveUILang().toLowerCase().startsWith('zh') ? 'EN' : '中';
    langDock.appendChild(langBtnDock);
    
    // 创建主容器
    const list = document.createElement("div");
    list.className = "gpt-bookmark-list collapsed";
    list.id = "gpt-bookmark-list";
    
    // 添加基础内容
    const langSymbol = getEffectiveUILang().startsWith('zh') ? '中' : 'E';
    list.innerHTML = `
        <div class="bookmark-content">
            <div class="group-header">
                ${USER_SETTINGS.enableBakeFlow ? `
                 <div class=\"topbar\" style=\"display:flex; justify-content:space-between; align-items:center; gap:8px; padding:2px 0;\">
                    <div class=\"topbar-left\" style=\"display:flex; gap:6px; align-items:center;\">
                        <button class=\"bake-btn\">${i18n('bake')}${getLangBang()}</button>
                        <button class=\"copy-btn\" title=\"${i18n('copyTooltip')}\">${i18n('copy')}</button>
                </div>
                    <div class=\"topbar-right\" style=\"display:flex; gap:6px; align-items:center;\"> 
                        <button class=\"sort-btn\" title=\"${i18n('viewSwitch')}\">${isSortByGroup ? i18n('sortByGroup') : i18n('sortByTime')}</button>
            </div>
                 </div>
                ` : `
                 <div style=\"display: flex; gap: 6px; justify-content: flex-start; padding: 2px 0;\">  
                    <button class=\"sort-btn\" title=\"${i18n('viewSwitch')}\">${isSortByGroup ? i18n('sortByGroup') : i18n('sortByTime')}</button>
                 </div>
                `}
            </div>
            <div class=\"bookmarks-scroll\"></div>
        </div>
        <div class="batch-actions-container" id="batch-actions-container">
             <div class="batch-actions-title">已选择 <span id="selected-count">0</span> 个书签</div>
             <div class="batch-actions-buttons">
                <button class="batch-delete-btn">${i18n('delete')}</button>
                <button class="batch-move-btn">${i18n('move')}</button>
                <button class="batch-export-btn">${i18n('export')}</button>
            </div>
        </div>
    `;
    
    // 直接将UI元素添加到body中
    if (gptBurgerRoot) {
        gptBurgerRoot.appendChild(toggleBtn);
        gptBurgerRoot.appendChild(langDock);
        gptBurgerRoot.appendChild(list);
    } else {
    document.body.appendChild(toggleBtn);
        document.body.appendChild(langDock);
    document.body.appendChild(list);
    }
    
    console.log("✅ [Debug] createBookmarkUI: UI elements (toggle, list) appended to the root container.");
    
    // 悬停展开相关变量已在全局定义
    
    // 添加悬停展开功能
    toggleBtn.addEventListener('mouseenter', () => {
        if (!USER_SETTINGS.enableHoverExpand) return; // 检查设置开关
        
        isHoveringButton = true;
        
        // 立即展开
        if (list.classList.contains('collapsed')) {
            list.classList.remove('collapsed');
            
            toggleBtn.title = "收起书签";
            console.log("🖱️ 悬停展开书签列表");
            langDock.classList.remove('collapsed');
        }
    });
    
    toggleBtn.addEventListener('mouseleave', () => {
        if (!USER_SETTINGS.enableHoverExpand) return; // 检查设置开关
        
        isHoveringButton = false;
        
        // 延迟检查是否需要收起
        setTimeout(() => {
            if (!isHoveringButton && !isHoveringList && !isHoveringDock) {
                if (!list.hasAttribute('data-keep-open') && !list.classList.contains('collapsed')) {
                    list.classList.add('collapsed');
                    // 保持自定义icon，不再写入emoji
                    toggleBtn.title = "展开书签";
                    console.log("🖱️ 悬停离开，收起书签列表");
                }
                // 同步隐藏语言切换 dock
                langDock.classList.add('collapsed');
            }
        }, 200);
    });
    
    // 书签列表的悬停状态
    list.addEventListener('mouseenter', () => {
        if (!USER_SETTINGS.enableHoverExpand) return;
        isHoveringList = true;
        // 当列表出现时显示语言容器（使用过渡类）
        langDock.classList.remove('collapsed');
    });
    
    list.addEventListener('mouseleave', () => {
        if (!USER_SETTINGS.enableHoverExpand) return;
        
        isHoveringList = false;
        // 延迟检查是否需要收起
        setTimeout(() => {
            if (!isHoveringButton && !isHoveringList && !isHoveringDock) {
                if (!list.hasAttribute('data-keep-open') && !list.classList.contains('collapsed')) {
                    list.classList.add('collapsed');
                    
                    toggleBtn.title = "展开书签";
                    console.log("🖱️ 离开书签列表，自动收起");
                }
                // 列表收起时隐藏语言容器（同步动画）
                langDock.classList.add('collapsed');
            }
        }, 200);
    });
    
    // 将语言 dock 与主容器视作同一 hover 区域
    langDock.addEventListener('mouseenter', () => {
        isHoveringDock = true;
        langDock.classList.remove('collapsed');
        if (list.classList.contains('collapsed')) {
            list.classList.remove('collapsed');
            
            toggleBtn.title = "收起书签";
        }
    });
    langDock.addEventListener('mouseleave', () => {
        isHoveringDock = false;
        setTimeout(() => {
            if (!isHoveringButton && !isHoveringList && !isHoveringDock) {
                if (!list.hasAttribute('data-keep-open') && !list.classList.contains('collapsed')) {
                    list.classList.add('collapsed');
                    
                    toggleBtn.title = "展开书签";
                }
                langDock.classList.add('collapsed');
            }
        }, 150);
    });
    
    // 添加视图切换（时间/分组）按钮事件
    const sortBtn = list.querySelector('.sort-btn');
    if (sortBtn) {
        // 初始化文案
        sortBtn.textContent = isSortByGroup ? i18n('sortByGroup') : i18n('sortByTime');
        sortBtn.onclick = () => {
            isSortByGroup = !isSortByGroup;
            console.log('🔄 切换显示模式:', isSortByGroup ? i18n('sortModeGroup') : i18n('sortModeTime'));
            // 单按钮：文本互切
            sortBtn.textContent = isSortByGroup ? i18n('sortByGroup') : i18n('sortByTime');
            renderBookmarkList();
        };
    }
    
    // （已移除）管理按钮事件：选择/管理模式迁出至后续"烘焙"弹窗内

    // 顶栏新按钮（M1 占位，无副作用）
    if (USER_SETTINGS.enableBakeFlow) {
        const copyBtn = list.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.onclick = async () => {
                try {
                    const exportContent = composeExportContent();
                    if (!exportContent) {
                        showMessage('copyFailed');
                        return;
                    }
                    await navigator.clipboard.writeText(exportContent);
                    handleCopyResult(true);
                } catch (err) {
                    handleCopyResult(false);
                }
            };
        }
        const bakeBtn = list.querySelector('.bake-btn');
        if (bakeBtn) {
            bakeBtn.onclick = () => {
                openBakeModal();
            };
        }
    }
    // 语言 Dock：无论是否开启 Bake，都可切换
    // 使用上方创建的 langBtnDock 元素，避免重复声明
    if (langBtnDock && !langBtnDock.dataset.bound) {
        langBtnDock.dataset.bound = '1';
        langBtnDock.addEventListener('click', async (e) => {
            e.stopPropagation();
            const current = getEffectiveUILang();
            const next = current && current.toLowerCase().startsWith('zh') ? 'en' : 'zh_CN';
            await setLanguageOverride(next);
            // 切换后按钮文字取反：中文界面 -> EN，英文界面 -> 中
            langBtnDock.textContent = next === 'zh_CN' ? 'EN' : '中';
            langDock.style.display = 'flex';
        });
    }
    
    // 立即渲染一次
    renderBookmarkList();
}

// 添加深色模式检测和切换
function handleThemeChange() {
    console.log("🌓 检测到主题变化");
    const isDarkMode = document.documentElement.classList.contains('dark');
    console.log(`🎨 当前主题模式: ${isDarkMode ? '深色' : '浅色'}`);
    
    // 重新创建UI以应用新主题
    console.log("🔄 重新创建UI以应用新主题");
    createBookmarkUI();
}

// 组装拷贝内容（最小可用版）：
// - 若存在选中项：按选择的书签 summary 逐条拼接
// - 否则：默认全量当前对话的书签 summary
function composeExportContent() {
    try {
        const currentChatData = ensureCurrentChatData();
        if (!currentChatData || !currentChatData.bookmarks) return '';
        const selectedIds = Array.from(selectedBookmarks || []);
        const source = (selectedIds.length > 0)
            ? currentChatData.bookmarks.filter(bm => selectedIds.includes(bm.id))
            : currentChatData.bookmarks;
        const content = source.map(bm => bm.summary || '').filter(Boolean).join('\n\n');
        return content.trim();
    } catch (e) {
        return '';
    }
}

// M2: 简版"烘焙"弹窗（先可用）：
// - 目的：让"烘焙"按钮先能打开弹窗，并提供复制（带前后提示）的功能
// - 后续可迭代 chips/分组重排/预览卡片等高级功能
function openBakeModal() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    const backdrop = document.createElement('div');
    backdrop.className = 'export-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'export-modal';

    const intro = i18n('bakeIntro');
    const content = composeExportContent();

    // 预设 chips（结构化/创意化）
    const presets = [
        {
            key: 'structured',
            title: i18n('presetStructured') || '结构化',
            head: i18n('presetStructuredHead'),
            tail: i18n('presetStructuredTail')
        },
        {
            key: 'creative',
            title: i18n('presetCreative') || '创意化',
            head: i18n('presetCreativeHead'),
            tail: i18n('presetCreativeTail')
        }
    ];
    const chipsHtml = `<div class="export-preset-chips">${presets
        .map(p => `<span class="preset-chip" data-key="${p.key}">${p.title}</span>`)
        .join('')}</div>`;

    modal.innerHTML = `
        <div class="export-header">
            <div>
                <div class="export-modal-title">${i18n('bake')}</div>
                <div class="export-modal-desc">${intro}</div>
            </div>
        </div>
        ${chipsHtml}
        <div class="export-textareas">
            <textarea class="export-head-input" placeholder="${i18n('promptHeadPlaceholder')}"></textarea>
            <textarea class="export-tail-input" placeholder="${i18n('promptTailPlaceholder')}"></textarea>
        </div>
        <textarea class="export-content-input" placeholder="" ></textarea>
        <div class="export-modal-actions">
            <button class="export-cancel-btn" data-action="cancel">${i18n('cancel')}</button>
            <button class="export-confirm-btn" data-action="bake">${i18n('bake')}</button>
        </div>
    `;

    const close = () => {
        backdrop.remove();
        modal.remove();
        document.removeEventListener('keydown', onKeydown);
    };
    const onKeydown = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeydown);

    // 初始化可编辑正文
    const contentInput = modal.querySelector('.export-content-input');
    if (contentInput) {
        contentInput.value = content || '';
    }

    // chips 点击填充提示词
    const headInput = modal.querySelector('.export-head-input');
    const tailInput = modal.querySelector('.export-tail-input');
    modal.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.getAttribute('data-key');
            const preset = presets.find(p => p.key === key);
            if (!preset) return;
            const isActive = chip.classList.contains('active');
            // 再次点击取消：清空文本并移除激活
            if (isActive) {
                chip.classList.remove('active');
                headInput.value = '';
                tailInput.value = '';
                return;
            }
            // 单选激活
            modal.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            headInput.value = preset.head || '';
            tailInput.value = preset.tail || '';
        });
    });

    modal.addEventListener('click', async (e) => {
        const action = e.target.getAttribute('data-action');
        if (action === 'cancel') return close();
        if (action === 'bake') {
            const head = (modal.querySelector('.export-head-input').value || '').trim();
            const mid = (modal.querySelector('.export-content-input').value || '').trim();
            const tail = (modal.querySelector('.export-tail-input').value || '').trim();
            const finalText = [head, mid, tail].filter(Boolean).join('\n\n');
            try {
                await navigator.clipboard.writeText(finalText);
                handleCopyResult(true);
                close();
            } catch (err) {
                handleCopyResult(false);
            }
        }
    });
    backdrop.addEventListener('click', close);

    const root = document.getElementById('gpt-burger-root') || document.body;
    root.appendChild(backdrop);
    root.appendChild(modal);
}

// 简化编辑功能
function makeEditable(element, originalValue, onSave) {
    console.log('🖊️ Making element editable seamlessly:', element);

    const valueToEdit = originalValue || '';
    const isTextarea = valueToEdit.length > 50 || valueToEdit.includes('\n');
    const editInput = document.createElement(isTextarea ? 'textarea' : 'input');
    
    // Inherit styles for seamless editing
    const computedStyle = window.getComputedStyle(element);
    editInput.style.font = computedStyle.font;
    editInput.style.fontWeight = computedStyle.fontWeight;
    editInput.style.lineHeight = computedStyle.lineHeight;
    editInput.style.color = computedStyle.color;
    editInput.className = 'bookmark-edit-input';
    editInput.value = valueToEdit;

    if (isTextarea) {
        editInput.style.height = element.offsetHeight + 'px'; // Start with the same height
    }
    
    element.replaceWith(editInput);
    editInput.focus();
    editInput.select();

    const saveChanges = () => {
        const newValue = editInput.value.trim();
        if (newValue !== valueToEdit) {
            onSave(newValue);
        }
        renderBookmarkList();
    };

    editInput.onblur = saveChanges;
    editInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !isTextarea) {
            e.preventDefault();
            saveChanges();
        }
        if (e.key === 'Escape') {
            editInput.value = valueToEdit;
            saveChanges();
        }
    };
}

// 简化跳转功能
function jumpToBookmark(bookmark) {
    console.log('🎯 准备跳转到书签位置', bookmark);
    
    if (!bookmark.offset) {
        console.warn('❌ 书签没有保存位置信息');
        alert('书签没有保存跳转位置！');
        return;
    }
    
    const scrollContainer = document.querySelector('main div[class*="overflow-y-auto"]');
    if (!scrollContainer) {
        console.warn('❌ 未找到滚动容器');
        alert('未找到滚动容器！');
        return;
    }
    
    // 🔍 调试：先检查页面上所有的article元素
    const allArticles = document.querySelectorAll('article[data-testid]');
    console.log('🔍 当前页面上的所有article元素:', Array.from(allArticles).map(a => a.dataset.testid));
    console.log('🎯 要查找的articleId:', bookmark.articleId);

    // 🎯 关键：首先确保找到正确的 article
    const targetArticle = document.querySelector(`article[data-testid="${bookmark.articleId}"]`);
    
    // 🔍 调试：检查查找结果
    if (targetArticle) {
        console.log('✅ querySelector找到的文章:', targetArticle.dataset.testid);
        console.log('✅ 目标文章DOM元素:', targetArticle);
        
        // 验证找到的是否是正确的
        if (targetArticle.dataset.testid !== bookmark.articleId) {
            console.error('❌❌❌ 严重错误：querySelector返回了错误的元素！');
            console.error('❌ 期望找到:', bookmark.articleId);
            console.error('❌ 实际找到:', targetArticle.dataset.testid);
            
            // 手动查找正确的元素
            const correctArticle = Array.from(allArticles).find(a => a.dataset.testid === bookmark.articleId);
            if (correctArticle) {
                console.log('🔧 手动找到正确的文章:', correctArticle.dataset.testid);
                console.log('🔧 使用手动找到的元素继续');
                // 使用正确的元素继续后续逻辑
                // 但是先简单跳转测试
                const target = bookmark.offset - window.innerHeight / 2;
                scrollContainer.scrollTo({ top: target, behavior: 'smooth' });
                return;
            }
        }
    } else {
        console.warn(`❌ 无法找到目标文章 (articleId: ${bookmark.articleId})`);
        console.warn('❌ 可能的原因：1) articleId保存错误 2) 页面还没加载完成 3) articleId格式问题');
        
        // 尝试模糊匹配
        const partialMatch = Array.from(allArticles).find(a => 
            a.dataset.testid && a.dataset.testid.includes(bookmark.articleId.split('-').pop())
        );
        if (partialMatch) {
            console.log('🔧 尝试使用模糊匹配到的article:', partialMatch.dataset.testid);
            const target = bookmark.offset - window.innerHeight / 2;
            scrollContainer.scrollTo({ top: target, behavior: 'smooth' });
            return;
        }
        
        // 回退到原有的offset逻辑
        const target = bookmark.offset - window.innerHeight / 2;
        scrollContainer.scrollTo({ top: target, behavior: 'smooth' });
        return;
    }

    console.log('✅ 找到目标文章:', bookmark.articleId);

    // 如果有新的容器信息，尝试定位
    if (bookmark.containerInfo && bookmark.containerInfo.container) {
        const containerInfo = bookmark.containerInfo.container;
        const targetText = containerInfo.selectedText;
        const containerType = bookmark.containerInfo.type;
        
        console.log(`🔍 容器类型: ${containerType}, 查找目标文本: "${targetText}"`);
        
        // 🎯 在正确的article内查找容器
        const elements = targetArticle.querySelectorAll(containerInfo.tagName);
        console.log(`🔍 在目标文章中找到 ${elements.length} 个 ${containerInfo.tagName} 元素`);
        
        let foundContainer = null;
        
        if (containerType === 'text') {
            // 📝 普通文本：精准定位到包含目标文本的位置
            console.log('📝 普通文本 - 使用精准定位');
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (el.textContent && el.textContent.includes(targetText)) {
                    foundContainer = el;
                    console.log(`✅ 找到包含目标文本的元素 (第${i+1}个)`);
                    break;
                }
            }
        } else if (containerType === 'code' || containerType === 'table') {
            // 💻📊 代码块或表格：定位到开头
            console.log(`${containerType === 'code' ? '💻' : '📊'} ${containerType === 'code' ? '代码块' : '表格'} - 定位到开头`);
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (el.textContent && el.textContent.includes(targetText)) {
                    foundContainer = el;
                    console.log(`✅ 找到包含目标文本的${containerType === 'code' ? '代码块' : '表格'} (第${i+1}个)，将定位到开头`);
                    break;
                }
            }
        } else {
            // 🔧 其他类型：简单匹配
            console.log('🔧 其他类型 - 简单匹配');
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (el.textContent && el.textContent.includes(targetText)) {
                    foundContainer = el;
                    console.log(`✅ 找到匹配元素 (第${i+1}个)`);
                    break;
                }
            }
        }
        
        if (foundContainer) {
            // 🔧 计算绝对位置：获取元素相对于页面顶部的位置
            let absoluteTop = 0;
            let element = foundContainer;
            while (element) {
                absoluteTop += element.offsetTop;
                element = element.offsetParent;
            }
            
            console.log(`🔧 容器位置信息:`, {
                offsetTop: foundContainer.offsetTop,
                absoluteTop: absoluteTop,
                containerType: containerType
            });
            
            let target;
            
            if (containerType === 'text') {
                // 📝 普通文本：定位到容器中间位置（更精准）
                target = absoluteTop - window.innerHeight / 3;
                console.log('📝 普通文本定位到中间位置:', target);
            } else {
                // 💻📊 代码块/表格：定位到容器开头，但显示在屏幕中间
                target = absoluteTop - window.innerHeight / 2;
                console.log(`${containerType === 'code' ? '💻' : '📊'} ${containerType === 'code' ? '代码块' : '表格'}定位到开头，显示在屏幕中间:`, target);
            }
            
            scrollContainer.scrollTo({ top: target, behavior: 'smooth' });
    console.log('✅ 跳转完成');
            return;
        }
    }
    
    // 如果精确定位失败，使用原有的offset
    const target = bookmark.offset - window.innerHeight / 2;
    console.log('🎯 使用原有offset，跳转到:', target);
    scrollContainer.scrollTo({ top: target, behavior: 'smooth' });
}

// 显示移动到分组的弹窗
function showMoveToGroupPopup(selectedIds) {
    console.log('显示移动到分组弹窗，选中的书签：', selectedIds);
    
    // 获取现有的所有分组
    const existingGroups = new Set();
    const chatData = allBookmarks[currentChatId];
    if (chatData && Array.isArray(chatData.bookmarks)) {
        chatData.bookmarks.forEach(bm => {
            if (bm.group && !DEFAULT_COLOR_GROUPS.includes(bm.group)) {
                existingGroups.add(bm.group);
            }
        });
    }
    console.log('现有分组：', existingGroups);
    
    // 创建弹窗
    const popup = document.createElement('div');
    popup.className = 'move-to-group-popup';
    const isDarkMode = document.documentElement.classList.contains('dark');
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${isDarkMode ? '#202123' : 'white'};
        color: ${isDarkMode ? '#fff' : '#000'};
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 10000;
        min-width: 200px;
        border: 1px solid ${isDarkMode ? '#4a4b4d' : '#ccc'};
    `;
    
    // 创建弹窗内容
    popup.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">${i18n('selectTargetGroup')}</div>
        <div class="group-list" style="margin-bottom: 12px;">
            <div class="group-option" data-group="" style="padding: 4px 8px; cursor: pointer; border-radius: 4px;">
                📦 ${i18n('defaultGroup')}
            </div>
            ${DEFAULT_COLOR_GROUPS.map(color => `
                <div class="group-option" data-group="${color}" style="padding: 4px 8px; cursor: pointer; border-radius: 4px;">
                    ${color}
                </div>
            `).join('')}
            ${Array.from(existingGroups).map(group => `
                <div class="group-option" data-group="${group}" style="padding: 4px 8px; cursor: pointer; border-radius: 4px;">
                    ${group}
                </div>
            `).join('')}
        </div>
        <div style="margin-bottom: 8px;">
            <input type="text" placeholder="${i18n('enterGroupName')}" class="new-group-input" style="
                width: 100%;
                padding: 4px 8px;
                border: 1px solid ${isDarkMode ? '#4a4b4d' : '#ccc'};
                border-radius: 4px;
                background: ${isDarkMode ? '#343541' : 'white'};
                color: ${isDarkMode ? '#fff' : '#000'};
            ">
        </div>
        <div style="text-align: right;">
            <button class="cancel-move" style="
                padding: 4px 8px;
                margin-right: 8px;
                border-radius: 4px;
                background: ${isDarkMode ? '#343541' : '#f0f0f0'};
                color: ${isDarkMode ? '#fff' : '#666'};
                border: none;
                cursor: pointer;
            ">取消</button>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // 点击分组选项
    popup.querySelectorAll('.group-option').forEach(option => {
        option.addEventListener('click', () => {
            const groupName = option.dataset.group;
            moveBookmarksToGroup(selectedIds, groupName);
            popup.remove();
        });
        
        // 鼠标悬停效果
        option.addEventListener('mouseover', () => {
            option.style.background = isDarkMode ? '#343541' : '#f0f0f0';
        });
        option.addEventListener('mouseout', () => {
            option.style.background = 'transparent';
        });
    });
    
    // 处理新分组输入
    const newGroupInput = popup.querySelector('.new-group-input');
    newGroupInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const newGroup = newGroupInput.value.trim();
            if (newGroup) {
                console.log('📝 准备创建新分组:', newGroup);
                
                // 确保当前对话的数据结构存在
                if (!allBookmarks[currentChatId]) {
                    allBookmarks[currentChatId] = {
                        bookmarks: [],
                        groupOrder: ['', ...DEFAULT_COLOR_GROUPS],
                        groupMap: {}
                    };
                }
                
                // 确保 groupOrder 存在
                if (!allBookmarks[currentChatId].groupOrder) {
                    allBookmarks[currentChatId].groupOrder = ['', ...DEFAULT_COLOR_GROUPS];
                }
                
                // 检查是否存在重名分组，如果存在则添加数字后缀
                let finalGroupName = newGroup;
                let counter = 1;
                while (allBookmarks[currentChatId].groupOrder.includes(finalGroupName)) {
                    finalGroupName = `${newGroup}(${counter})`;
                    counter++;
                }
                console.log('📝 最终分组名称:', finalGroupName);
                
                // 添加新分组到 groupOrder
                if (!allBookmarks[currentChatId].groupOrder.includes(finalGroupName)) {
                    allBookmarks[currentChatId].groupOrder.push(finalGroupName);
                    console.log('✅ 新分组已添加到 groupOrder:', allBookmarks[currentChatId].groupOrder);
                }
                
                // 确保 groupMap 存在
                if (!allBookmarks[currentChatId].groupMap) {
                    allBookmarks[currentChatId].groupMap = {};
                }
                
                // 初始化新分组的 groupMap
                if (!allBookmarks[currentChatId].groupMap[finalGroupName]) {
                    allBookmarks[currentChatId].groupMap[finalGroupName] = [];
                }
                
                moveBookmarksToGroup(selectedIds, finalGroupName);
                popup.remove();
            }
        }
    });
    
    // 取消按钮
    popup.querySelector('.cancel-move').addEventListener('click', () => {
        popup.remove();
    });
}

// 移动书签到指定分组
function moveBookmarksToGroup(bookmarkIds, groupName) {
    console.log(`🔄 移动书签到分组开始：`, {
        bookmarkIds,
        targetGroup: groupName,
        currentGroups: allBookmarks[currentChatId]?.groupOrder || []
    });
    
    const chatData = allBookmarks[currentChatId];
    if (chatData && Array.isArray(chatData.bookmarks)) {
        chatData.bookmarks.forEach(bm => {
            if (bookmarkIds.includes(bm.id)) {
                const oldGroup = bm.group;
                bm.group = groupName;
                console.log(`📝 书签 ${bm.id} 从 "${oldGroup}" 移动到 "${groupName}"`);
            }
        });
        
        // 确保分组存在于 groupOrder 中
        if (groupName && !chatData.groupOrder.includes(groupName)) {
            chatData.groupOrder.push(groupName);
            console.log(`➕ 添加新分组到排序列表: ${groupName}`, chatData.groupOrder);
        }
        
        saveBookmarksToStorage();
        console.log(`✅ 移动完成，当前分组顺序:`, chatData.groupOrder);
        renderBookmarkList();
    }
}

// 在文件开头添加数据初始化的保护
function ensureCurrentChatData() {
    if (!allBookmarks[currentChatId]) {
        allBookmarks[currentChatId] = {
            bookmarks: [],
            groupOrder: ['', ...DEFAULT_COLOR_GROUPS],
            groupMap: {}
        };
    }
    return allBookmarks[currentChatId];
}

// 修改拖拽相关的处理函数
function handleBookmarkDrop(e, dragData, targetBookmark) {
    try {
        const currentChatData = ensureCurrentChatData();
        
        const draggedBookmark = currentChatData.bookmarks.find(bm => bm.id === dragData.id);
        if (!draggedBookmark) {
            console.warn('❌ 未找到拖拽的书签');
            return;
        }

        const dragIndex = currentChatData.bookmarks.indexOf(draggedBookmark);
        if (dragIndex === -1) {
            console.warn('❌ 书签索引无效');
            return;
        }

        // 获取目标位置
        const targetIndex = currentChatData.bookmarks.indexOf(targetBookmark);
        if (targetIndex === -1) {
            console.warn('❌ 目标位置无效');
            return;
        }

        // 根据鼠标位置决定插入点
        const rect = e.target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertIndex = e.clientY < midY ? targetIndex : targetIndex + 1;

        // 更新书签分组
        draggedBookmark.group = targetBookmark.group;

        // 移动书签
        const [removed] = currentChatData.bookmarks.splice(dragIndex, 1);
        currentChatData.bookmarks.splice(insertIndex > dragIndex ? insertIndex - 1 : insertIndex, 0, removed);

        console.log('📊 更新书签顺序:', {
            fromGroup: dragData.group,
            toGroup: targetBookmark.group,
            from: dragIndex,
            to: insertIndex,
            bookmark: draggedBookmark.summary
        });

        saveBookmarksToStorage();
        renderBookmarkList();
    } catch (error) {
        console.error('处理拖放时出错:', error);
    }
}

function handleEmptyGroupDrop(e, dragData, groupName) {
    try {
        const currentChatData = ensureCurrentChatData();
        
        const draggedBookmark = currentChatData.bookmarks.find(bm => bm.id === dragData.id);
        if (!draggedBookmark) {
            console.warn('❌ 未找到拖拽的书签');
            return;
        }

        const dragIndex = currentChatData.bookmarks.indexOf(draggedBookmark);
        if (dragIndex === -1) {
            console.warn('❌ 书签索引无效');
            return;
        }

        // 更新书签分组
        draggedBookmark.group = groupName;
        
        // 移动书签（放到组的末尾）
        currentChatData.bookmarks.splice(dragIndex, 1);
        currentChatData.bookmarks.push(draggedBookmark);

        console.log('📊 移动书签到空组:', {
            fromGroup: dragData.group,
            toGroup: groupName,
            bookmark: draggedBookmark.summary
        });

        saveBookmarksToStorage();
        renderBookmarkList();
    } catch (error) {
        console.error('空组 drop 处理出错:', error);
    }
}

// 创建单个书签元素
function createBookmarkElement(bookmark, index, groupName = null) {
    const div = document.createElement('div');
    div.className = 'bookmark-item';
    div.dataset.id = bookmark.id;
    div.dataset.index = index;
    div.dataset.group = bookmark.group;
    
    // 关键修复：为书签元素添加其分组对应的颜色类
    if (bookmark.group) {
        div.classList.add(`dynamic-color-${bookmark.group}`);
    }

    div.addEventListener('mouseenter', () => {
        const isLongText = div.classList.contains('expanded');
        console.log({
            summary: bookmark.summary,
            type: div.className.match(/(standard|expanded)/)[0],
            isLongText,
        });
    });
    
    if (isManageMode) {
        div.classList.add('manage-mode');
        div.innerHTML = `
            <input type="checkbox" class="bookmark-checkbox" ${selectedBookmarks.has(bookmark.id) ? 'checked' : ''}>
            <span class="bookmark-title">${bookmark.summary}</span>
        `;
        
        const checkbox = div.querySelector('.bookmark-checkbox');
        checkbox.addEventListener('change', (e) => {
            selectedBookmarks.has(bookmark.id) ? selectedBookmarks.delete(bookmark.id) : selectedBookmarks.add(bookmark.id);
            div.classList.toggle('selected', e.target.checked);
            updateBatchActionButtons();
        });
        checkbox.addEventListener('mouseup', (e) => {
            e.stopPropagation();
        });
    } else {
        div.draggable = true;
        div.innerHTML = `
            <span class="bookmark-title">${bookmark.summary}</span>
            <div class="bookmark-actions"></div>
        `;

        const titleElement = div.querySelector('.bookmark-title');
        titleElement.addEventListener('click', () => jumpToBookmark(bookmark));
        titleElement.addEventListener('dblclick', () => makeEditable(titleElement, bookmark));
    }
    
    return div;
}

// 清理所有拖拽提示线
function clearAllDropIndicators() {
    document.querySelectorAll('.bookmark-item, .bookmark-group').forEach(item => {
        item.style.borderTop = '';
        item.style.borderBottom = '';
        item.style.background = '';
    });
}

// ===== 拖拽插入位置中缝指示线 =====
let currentDropIndicator = null;
function insertDropIndicator(targetEl, before) {
    try {
        if (!currentDropIndicator) {
            currentDropIndicator = document.createElement('div');
            currentDropIndicator.className = 'drop-indicator';
        } else if (currentDropIndicator.parentNode) {
            currentDropIndicator.parentNode.removeChild(currentDropIndicator);
        }
        if (before) {
            targetEl.parentNode.insertBefore(currentDropIndicator, targetEl);
        } else {
            targetEl.parentNode.insertBefore(currentDropIndicator, targetEl.nextSibling);
        }
    } catch (err) {
        console.warn('插入指示线失败:', err);
    }
}

function clearDropIndicator() {
    if (currentDropIndicator && currentDropIndicator.parentNode) {
        currentDropIndicator.parentNode.removeChild(currentDropIndicator);
    }
    currentDropIndicator = null;
}

function renderBookmarkList() {
    console.log('🎨 开始渲染书签列表，显示模式:', isSortByGroup ? i18n('sortModeGroup') : i18n('sortModeTime'));
    
    const container = document.getElementById('gpt-bookmark-list');
    if (!container) {
        console.warn('⚠️ 未找到书签列表容器，重新创建UI');
        createBookmarkUI();
        return;
    }
    
    // 更新按钮状态（pill 开关：仅更新 thumb；无 pill 时回退为文字更新）
    const sortBtn = container.querySelector('.sort-btn');
            if (sortBtn) {
        const thumb = sortBtn.querySelector('.view-pill-thumb');
        const pill = sortBtn.querySelector('.view-pill');
        if (pill && thumb) {
            const state = isSortByGroup ? 'group' : 'time';
            pill.setAttribute('data-state', state);
            thumb.setAttribute('data-state', state);
        } else {
            sortBtn.textContent = isSortByGroup ? i18n('sortByTime') : i18n('sortByGroup');
        }
    }
    
    // 🆕 统一处理管理模式下的UI变化
    const mainContainer = document.getElementById('gpt-bookmark-list');
    const batchActionsContainer = mainContainer.querySelector('.batch-actions-container');
    const scrollContainer = mainContainer.querySelector('.bookmarks-scroll');
    if (scrollContainer) {
        // 清空旧列表内容，由后续分组/时间渲染填充
        scrollContainer.innerHTML = '';
    }

    if (isManageMode) {
        mainContainer.classList.add('manage-mode');
        
        const selectedCountSpan = batchActionsContainer.querySelector('#selected-count');
        selectedCountSpan.textContent = selectedBookmarks.size;

        // 使用新的显示/隐藏机制
        updateBatchActionButtons();

        const batchDeleteBtn = batchActionsContainer.querySelector('.batch-delete-btn');
        batchDeleteBtn.onclick = () => {
            if (confirm(i18n('deleteConfirm', [selectedBookmarks.size]))) {
                selectedBookmarks.forEach(bookmarkId => {
                    const index = allBookmarks[currentChatId].bookmarks.findIndex(bm => bm.id === bookmarkId);
                    if (index !== -1) {
                        allBookmarks[currentChatId].bookmarks.splice(index, 1);
                    }
                });
                selectedBookmarks.clear();
                saveBookmarksToStorage();
                renderBookmarkList();
            }
        };

        const batchMoveBtn = batchActionsContainer.querySelector('.batch-move-btn');
        batchMoveBtn.onclick = () => {
            showMoveToGroupPopup(Array.from(selectedBookmarks));
        };

        const batchExportBtn = batchActionsContainer.querySelector('.batch-export-btn');
        batchExportBtn.onclick = () => {
            try {
                console.log('📤 开始导出选中的书签内容');
                const selectedBookmarkIds = Array.from(selectedBookmarks);
                const selectedBookmarkContents = allBookmarks[currentChatId].bookmarks
                    .filter(bm => selectedBookmarkIds.includes(bm.id))
                    .map(bm => bm.summary)
                    .join('\n\n');
                
                // 检测当前主题模式
                const isDarkMode = document.documentElement.classList.contains('dark');
                
                // 创建导出选项对话框（使用统一tokens样式）
                const backdrop = document.createElement('div');
                backdrop.className = 'export-modal-backdrop';
                const exportDialog = document.createElement('div');
                exportDialog.className = 'export-modal';

                // 创建选项HTML（用统一类名，去内联）
                // 新导出界面文案与结构
                const simpleIntro = '我们会在你的书签内容前后加上你的提示词，你可以复制给 GPT 让它帮你整理或发散。';
                const presets = [
                    {
                        key: 'structured',
                        title: '结构化',
                        promptHead: '我收集了很多资料。请你帮我梳理层级与要点，输出结构清晰的总结：',
                        promptTail: '请用分层列表或小标题组织内容，尽量简洁准确。'
                    },
                    {
                        key: 'creative',
                        title: '创意化',
                        promptHead: '我挑选了一些点子。请你推测我的偏好，并继续发散更多方向：',
                        promptTail: '请按主题聚合，给出更多有延展性的新想法，并说明每个方向的可能价值。'
                    }
                ];

                // 预览卡片（标题 + 一行预览）
                const selectedCards = allBookmarks[currentChatId].bookmarks
                    .filter(bm => selectedBookmarkIds.includes(bm.id))
                    .map(bm => {
                        const title = (bm.title && String(bm.title).trim()) ? bm.title.trim() : (bm.summary || '').split('\n')[0];
                        const oneLine = (bm.summary || '').replace(/\n/g, ' ').slice(0, 60);
                        return `<div class="export-preview-card">
                            <div class="export-preview-title">${title || '无标题'}</div>
                            <div class="export-preview-summary">${oneLine}</div>
                        </div>`;
                    }).join('');

                exportDialog.innerHTML = `
                    <div class="export-header">
                        <div>
                            <div class="export-modal-title">导出到 GPT</div>
                            <div class="export-modal-desc">${simpleIntro}</div>
                        </div>
                        <div class="export-quick-actions">
                            <button class="export-confirm-btn">直接导出</button>
                        </div>
                    </div>

                    <div class="export-textareas">
                        <textarea class="export-head-input" placeholder="开头提示词（可编辑）"></textarea>
                        <div class="export-preview-grid">${selectedCards}</div>
                        <textarea class="export-tail-input" placeholder="结尾提示词（可编辑）"></textarea>
                    </div>

                    <div class="export-preset-chips">
                        ${presets.map(p => `<span class="preset-chip" data-key="${p.key}">${p.title}</span>`).join('')}
                    </div>

                    <div class="export-modal-actions">
                        <button class="export-cancel-btn">取消</button>
                        <button class="export-confirm-btn export-confirm-with-prompts">复制带提示词</button>
                    </div>
                `;

                // 添加tooltip和选项交互
                // 预设 chips -> 填充双文本框
                exportDialog.querySelectorAll('.preset-chip').forEach(chip => {
                    chip.addEventListener('click', () => {
                        exportDialog.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
                        chip.classList.add('active');
                        const key = chip.getAttribute('data-key');
                        const preset = presets.find(p => p.key === key);
                        if (preset) {
                            exportDialog.querySelector('.export-head-input').value = preset.promptHead;
                            exportDialog.querySelector('.export-tail-input').value = preset.promptTail;
                        }
                    });
                });

                // 取消按钮
                exportDialog.querySelector('.export-cancel-btn').onclick = () => {
                    backdrop.remove();
                    exportDialog.remove();
                };

                // 确认导出按钮
                // 直接导出（不加提示词）
                exportDialog.querySelector('.export-quick-actions .export-confirm-btn').onclick = () => {
                    const exportContent = selectedBookmarkContents;
                    navigator.clipboard.writeText(exportContent).then(() => {
                        alert(`已导出 ${selectedBookmarkIds.length} 个书签到剪贴板`);
                        backdrop.remove();
                        exportDialog.remove();
                    }).catch(() => alert('导出失败，请重试'));
                };

                // 复制带提示词
                exportDialog.querySelector('.export-confirm-with-prompts').onclick = () => {
                    const head = (exportDialog.querySelector('.export-head-input').value || '').trim();
                    const tail = (exportDialog.querySelector('.export-tail-input').value || '').trim();
                    const composed = `${head ? head + '\n\n' : ''}${selectedBookmarkContents}${tail ? '\n\n' + tail : ''}`;
                    navigator.clipboard.writeText(composed).then(() => {
                        alert(`已复制 ${selectedBookmarkIds.length} 个书签（含提示词）到剪贴板`);
                        backdrop.remove();
                        exportDialog.remove();
                    }).catch(() => alert('复制失败，请重试'));
                };
                // 默认选中样式与自定义输入可见性
                const checkedRadio = exportDialog.querySelector('input[name="exportType"]:checked');
                if (checkedRadio) {
                    const option = checkedRadio.closest('.export-option');
                    if (option) option.classList.add('selected');
                    const tpl = exportTemplates[checkedRadio.value];
                    if (tpl && tpl.needCustomPrompt) {
                        const cp = option && option.nextElementSibling;
                        if (cp && cp.classList.contains('export-custom-prompt')) cp.style.display = 'block';
                    }
                }

                // 附加到根容器，确保样式作用（依赖 #gpt-burger-root 作用域）
                if (gptBurgerRoot) {
                    gptBurgerRoot.appendChild(backdrop);
                    gptBurgerRoot.appendChild(exportDialog);
                } else {
                    document.body.appendChild(backdrop);
                    document.body.appendChild(exportDialog);
                }
                
            } catch (error) {
                console.error('导出功能出错:', error);
                alert('导出功能出错，请重试');
            }
        };

    } else {
        mainContainer.classList.remove('manage-mode');
    }
    
    // 确保当前对话的数据结构存在
    if (!allBookmarks[currentChatId]) {
        allBookmarks[currentChatId] = {
            bookmarks: [],
            groupOrder: ['', ...DEFAULT_COLOR_GROUPS]
        };
    }
    const currentChatData = allBookmarks[currentChatId];
    
    // 确保 groupOrder 存在且包含所有必要的分组
    if (!currentChatData.groupOrder) {
        currentChatData.groupOrder = ['', ...DEFAULT_COLOR_GROUPS];
    }
    
    console.log('📊 当前对话数据:', {
        chatId: currentChatId,
        groupOrder: currentChatData.groupOrder,
        totalBookmarks: currentChatData.bookmarks?.length || 0,
        displayMode: isSortByGroup ? i18n('sortModeGroup') : i18n('sortModeTime')
    });
    
    const bookmarkContent = container.querySelector('.bookmark-content');
    if (!bookmarkContent) {
        console.error("🚫 .bookmark-content not found inside", container);
        return;
    }

    const scrollRoot = bookmarkContent.querySelector('.bookmarks-scroll') || bookmarkContent;
    let bookmarksContainer = scrollRoot.querySelector('.bookmarks-container');
    if (!bookmarksContainer) {
        bookmarksContainer = document.createElement('div');
        bookmarksContainer.className = 'bookmarks-container';
        scrollRoot.appendChild(bookmarksContainer);
    }
    
    // 清空书签容器
    bookmarksContainer.innerHTML = '';
    
    // 🆕 根据显示模式选择渲染方式
    if (isSortByGroup) {
        renderByGroupMode(currentChatData, bookmarksContainer);
    } else {
        renderByTimeMode(currentChatData, bookmarksContainer);
    }
}

// 🆕 按分组排序渲染（原来的逻辑）
function renderByGroupMode(currentChatData, container) {
    console.log('📂 使用分组排序模式渲染（无标题）');

    // 1. 将书签按分组聚合
    const groups = new Map();
    currentChatData.bookmarks.forEach(bookmark => {
        const groupKey = bookmark.group || '';
        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }
        groups.get(groupKey).push(bookmark);
    });

    // 2. 对分组进行排序，确保无分组（''）的在最后
    const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
        if (a === '') return 1;
        if (b === '') return -1;
        return a.localeCompare(b);
    });

    // 3. 创建一个排序后的扁平书签数组
    const sortedBookmarks = [];
    sortedGroupKeys.forEach(groupKey => {
        sortedBookmarks.push(...groups.get(groupKey));
    });

    // 4. 在一个统一的容器中渲染所有书签
    const bookmarksContainer = document.createElement('div');
    bookmarksContainer.className = 'bookmarks-container group-sorted'; // 使用新类名以示区分

    if (sortedBookmarks.length === 0) {
        bookmarksContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无书签</div>';
    } else {
        sortedBookmarks.forEach((bookmark, index) => {
            // 复用时间模式的元素创建函数，因为外观一致
            const bookmarkElement = createTimeBookmarkElement(bookmark, index);
            bookmarksContainer.appendChild(bookmarkElement);
        });
    }

    const scrollRoot = (container.querySelector('.bookmarks-scroll') || container);
    scrollRoot.appendChild(bookmarksContainer);
}

// 🆕 创建统一的书签元素，适配所有模式
function createTimeBookmarkElement(bookmark, index) {
    const element = document.createElement('div');
    element.className = 'bookmark-item time-mode';
    element.dataset.id = bookmark.id;
    element.dataset.index = index;
    element.dataset.group = bookmark.group;
    
    if (bookmark.group) {
        element.classList.add(`dynamic-color-${bookmark.group}`);
    }

    // --- 统一的HTML结构 ---
    const titleToShow = bookmark.title || i18n('untitled');
    const contentHTML = `
        <div class="bookmark-text-content">
            <div class="bookmark-title-display">${titleToShow}</div>
            <div class="bookmark-summary">${bookmark.summary}</div>
        </div>
    `;
    
    if (isManageMode) {
        element.classList.add('manage-mode');
        const checkboxHTML = `<input type="checkbox" class="bookmark-checkbox" ${selectedBookmarks.has(bookmark.id) ? 'checked' : ''}>`;
        element.innerHTML = checkboxHTML + contentHTML;

        if (selectedBookmarks.has(bookmark.id)) {
            element.classList.add('selected');
        }
    } else {
        const actionsHTML = `
            <div class="bookmark-actions"></div>
        `;
        element.innerHTML = contentHTML + actionsHTML;

        // 右下角 kebab（纵向）按钮与内联编辑面板（删除/三色分组/移除分组）
        const actionsEl = element.querySelector('.bookmark-actions');
        if (actionsEl) {
            const kebabBtn = document.createElement('button');
            kebabBtn.className = 'bookmark-kebab-btn';
            kebabBtn.title = i18n('edit');
            kebabBtn.textContent = '⋮';
            actionsEl.appendChild(kebabBtn);

            let inlinePanelEl = null;

            const closeAnyOpenInlinePanel = () => {
                const openPanels = document.querySelectorAll('#gpt-burger-root .bookmark-inline-editor-panel');
                openPanels.forEach(p => p.remove());
                const openedItems = document.querySelectorAll('#gpt-burger-root .bookmark-item[data-inline-open="true"]');
                openedItems.forEach(it => it.removeAttribute('data-inline-open'));
            };

            const buildInlinePanel = () => {
                const panel = document.createElement('div');
                panel.className = 'bookmark-inline-editor-panel';

                // 第一行：三个分组按钮，居中
                const row1 = document.createElement('div');
                row1.className = 'bookmark-inline-editor-row row-top';

                // 另外三个分组按钮（排除当前分组），复用保存弹窗样式
                const allGroups = DEFAULT_COLOR_GROUPS.slice();
                const currentGroup = bookmark.group || '';
                const candidateGroups = allGroups.filter(g => g !== currentGroup).slice(0, 3);
                candidateGroups.forEach(g => {
                    const gb = document.createElement('button');
                    gb.className = `compact-group-btn group-style-${g}`;
                    gb.dataset.group = g;
                    gb.title = i18n('group') + ' ' + g;
                    gb.addEventListener('click', (e) => {
                        e.stopPropagation();
                        try {
                            bookmark.group = g;
                            saveBookmarksToStorage();
                            renderBookmarkList();
                        } catch (err) {
                            console.error('移动书签到分组失败', err);
                        }
                    });
                    row1.appendChild(gb);
                });

                // 第二行：移除分组 + 删除按钮，居中对齐
                const row2 = document.createElement('div');
                row2.className = 'bookmark-inline-editor-row row-bottom';

                // 移除分组
                const removeBtn = document.createElement('button');
                removeBtn.className = 'inline-editor-remove-btn';
                removeBtn.textContent = i18n('removeFromGroup');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    try {
                        bookmark.group = '';
                        saveBookmarksToStorage();
                        renderBookmarkList();
                    } catch (err) {
                        console.error('移除书签分组失败', err);
                    }
                });
                row2.appendChild(removeBtn);

                // 删除按钮
                const delBtn = document.createElement('button');
                delBtn.className = 'inline-editor-delete-btn';
                delBtn.textContent = i18n('delete');
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!confirmDelete('bookmark')) return;
                    try {
                        const chatData = ensureCurrentChatData();
                        const idx = chatData.bookmarks.findIndex(b => b.id === bookmark.id);
                        if (idx !== -1) {
                            chatData.bookmarks.splice(idx, 1);
                            saveBookmarksToStorage();
                            renderBookmarkList();
                        }
                    } catch (err) {
                        console.error('删除书签失败', err);
                    }
                });
                row2.appendChild(delBtn);

                panel.appendChild(row1);
                panel.appendChild(row2);
                return panel;
            };

            kebabBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 切换：若已打开则关闭，否则关闭其他并打开当前
                const isOpen = element.getAttribute('data-inline-open') === 'true';
                if (isOpen) {
                    if (inlinePanelEl) inlinePanelEl.remove();
                    element.removeAttribute('data-inline-open');
                    inlinePanelEl = null;
                } else {
                    closeAnyOpenInlinePanel();
                    inlinePanelEl = buildInlinePanel();
                    // 在当前书签下方插入
                    const parent = element.parentElement;
                    if (parent) {
                        parent.insertBefore(inlinePanelEl, element.nextSibling);
                        element.setAttribute('data-inline-open', 'true');
                    }
                }
            });
        }
    }

    // --- 统一的事件监听 ---
    const titleDisplay = element.querySelector('.bookmark-title-display');
    const summaryDisplay = element.querySelector('.bookmark-summary');
    
    // 双击编辑标题 (所有模式)
    titleDisplay.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (titleDisplay._clickTimer) {
            clearTimeout(titleDisplay._clickTimer);
            titleDisplay._clickTimer = null;
        }
        makeEditable(titleDisplay, bookmark.title, (newTitle) => {
            bookmark.title = newTitle;
            saveBookmarksToStorage();
        });
    });

    // 双击编辑正文 (所有模式)
    summaryDisplay.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (summaryDisplay._clickTimer) {
            clearTimeout(summaryDisplay._clickTimer);
            summaryDisplay._clickTimer = null;
        }
        makeEditable(summaryDisplay, bookmark.summary, (newSummary) => {
            bookmark.summary = newSummary;
            saveBookmarksToStorage();
        });
    });

    // --- 分模式的事件监听 ---
    if (isManageMode) {
        const checkbox = element.querySelector('.bookmark-checkbox');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selectedBookmarks.add(bookmark.id);
                element.classList.add('selected');
            } else {
                selectedBookmarks.delete(bookmark.id);
                element.classList.remove('selected');
            }
            updateSelectedCount(selectedBookmarks.size);
        });
    } else {
        // 点击跳转（延迟判定单击，避免与双击编辑冲突；拖拽中屏蔽点击）
        const SINGLE_CLICK_DELAY = 220;
        summaryDisplay.addEventListener('click', (ev) => {
            if (isDraggingBookmarkGlobal) { ev.preventDefault(); ev.stopPropagation(); return; }
            // 如果正在编辑，忽略
            const editingInput = element.querySelector('input.bookmark-edit-input, textarea.bookmark-edit-input');
            if (editingInput) { ev.preventDefault(); ev.stopPropagation(); return; }
            if (summaryDisplay._clickTimer) clearTimeout(summaryDisplay._clickTimer);
            summaryDisplay._clickTimer = setTimeout(() => {
                // 确认未进入编辑
                const stillEditing = element.querySelector('input.bookmark-edit-input, textarea.bookmark-edit-input');
                if (!stillEditing) jumpToBookmark(bookmark);
                summaryDisplay._clickTimer = null;
            }, SINGLE_CLICK_DELAY);
        });
        titleDisplay.addEventListener('click', (ev) => {
            if (isDraggingBookmarkGlobal) { ev.preventDefault(); ev.stopPropagation(); return; }
            const editingInput = element.querySelector('input.bookmark-edit-input, textarea.bookmark-edit-input');
            if (editingInput) { ev.preventDefault(); ev.stopPropagation(); return; }
            if (titleDisplay._clickTimer) clearTimeout(titleDisplay._clickTimer);
            titleDisplay._clickTimer = setTimeout(() => {
                const stillEditing = element.querySelector('input.bookmark-edit-input, textarea.bookmark-edit-input');
                if (!stillEditing) jumpToBookmark(bookmark);
                titleDisplay._clickTimer = null;
            }, SINGLE_CLICK_DELAY);
        });

        // 拖拽
        // 统一的拖拽开始/结束处理，供 handle 与整行元素共用
        const startDragging = (e) => {
            e.stopPropagation();
            isDraggingBookmarkGlobal = true;
            const rect = element.getBoundingClientRect();

            // 使用自定义"小标签"作为拖拽预览（仅标题，样式与书签一致、非透明）
            const root = document.getElementById('gpt-burger-root') || document.body;
            const mini = document.createElement('div');
            mini.className = 'drag-mini-tag';
            const titleText = (bookmark.title && String(bookmark.title).trim())
                ? String(bookmark.title).trim()
                : (bookmark.summary ? String(bookmark.summary).split('\n')[0].slice(0, 80) : '无标题');
            mini.textContent = titleText;
            mini.style.position = 'absolute';
            mini.style.top = '-9999px';
            mini.style.left = '-9999px';
            // 按分组设置背景与边框颜色（与现有变量保持一致）
            const g = bookmark.group;
            if (g === '1' || g === '2' || g === '3' || g === '4') {
                mini.style.background = `var(--gptb-color-group-${g}-bg)`;
                mini.style.border = `1px solid var(--gptb-color-group-${g}-border)`;
            } else {
                mini.style.background = 'var(--gptb-color-background-item-hover)';
                mini.style.border = '1px solid var(--gptb-color-border-default)';
            }
            root.appendChild(mini);

            // 容错：确保 dataTransfer 存在
            if (!e.dataTransfer) {
                try { e.dataTransfer = new DataTransfer(); } catch (_) {}
            }

            const offsetX = 8;
            const offsetY = Math.min(20, Math.max(8, rect.height / 3));
            if (e.dataTransfer && e.dataTransfer.setDragImage) {
                e.dataTransfer.setDragImage(mini, offsetX, offsetY);
            }

            // 源元素保持可见，避免部分浏览器因隐藏源元素而取消拖拽
            // 通过 dragging 类与预览图像共同呈现拖拽状态

            // 记录以便结束时清理
            element._dragGhost = mini;

            const dragData = { type: 'bookmark-time', id: bookmark.id, index: index };
            try {
                e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
            } catch (_) {}
            element.classList.add('dragging');
        };

        const endDragging = () => {
            element.classList.remove('dragging');
            // 清理拖拽预览与占位
            if (element._dragGhost) {
                element._dragGhost.remove();
                element._dragGhost = null;
            }
            // 源元素保持可见，无需恢复
            clearDropIndicator();
            clearAllDropIndicators();
            isDraggingBookmarkGlobal = false;
        };

        // 为整条书签启用拖拽
        element.setAttribute('draggable', 'true');
        element.addEventListener('dragstart', (e) => {
            // 避免从复选框、链接等控件开始拖拽
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'button' || tag === 'a' || tag === 'textarea') return;
            // Firefox 需要 draggable 元素本身成为 dataTransfer 的来源
            try { e.dataTransfer.setData('text/plain', 'init'); } catch (_) {}
            startDragging(e);
        });
        element.addEventListener('dragend', endDragging);

        // 提供 1x1 透明图作为 drag image（避免显示分身）
        function getTransparentDragImage() {
            if (getTransparentDragImage.el) return getTransparentDragImage.el;
            const canvas = document.createElement('canvas');
            canvas.width = 1; canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 1, 1);
            getTransparentDragImage.el = canvas;
            return canvas;
        }
        
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const draggingElement = document.querySelector('.bookmark-item.dragging');
            if (!draggingElement) return;
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

            // 实时吸附：根据鼠标位置将被拖拽元素（不可见）移动到目标位置
            const containerEl = element.parentElement; // .bookmarks-container
            if (!containerEl) return;

            // 计算应插入到哪个兄弟元素之前
            const siblings = Array.from(containerEl.children).filter(node => node.classList && node.classList.contains('bookmark-item'));
            const others = siblings.filter(it => it !== draggingElement);

            let insertBeforeNode = null;
            for (const it of others) {
                const r = it.getBoundingClientRect();
                const mid = r.top + r.height / 2;
                if (e.clientY < mid) {
                    insertBeforeNode = it;
                    break;
                }
            }

            // 当前拖拽的是哪一个元素（不可见的原元素）
            const hiddenEl = draggingElement; // 当前被拖拽的书签元素

            // 若位置已正确则不操作，避免大量重排
            const currentNext = hiddenEl.nextSibling;
            if ((insertBeforeNode === hiddenEl) || (insertBeforeNode === currentNext)) {
                // 已在正确位置，无需处理
            } else {
                try {
                    // 设置过渡以获得顺滑动画
                    others.forEach(it => { it.style.transition = 'transform 160ms ease'; it.style.willChange = 'transform'; });
                    containerEl.insertBefore(hiddenEl, insertBeforeNode);
                } catch (_) {}
                // 清理过渡，避免后续影响
                requestAnimationFrame(() => {
                    others.forEach(it => { it.style.transition = ''; it.style.willChange = ''; });
                });
            }

            // 自动滚动：当拖拽到容器边缘时，平滑滚动
            const scrollEl = document.querySelector('#gpt-bookmark-list .bookmark-content');
            if (scrollEl) {
                const bounds = scrollEl.getBoundingClientRect();
                const edge = 24; // 距离边缘 24px 触发滚动
                const maxStep = 16; // 每帧最大滚动像素
                if (e.clientY < bounds.top + edge) {
                    scrollEl.scrollTop -= maxStep;
                } else if (e.clientY > bounds.bottom - edge) {
                    scrollEl.scrollTop += maxStep;
                }
            }
        });

        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            // 不在元素边界上画线，使用独立的指示线元素
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const dragDataStr = e.dataTransfer.getData('text/plain');
                if (!dragDataStr) return;
                const dragData = JSON.parse(dragDataStr);
                if (!dragData || dragData.type !== 'bookmark-time') return;
                // 使用当前DOM顺序来确定最终索引，实现所见即所得
                const containerEl = element.parentElement;
                if (!containerEl) return;
                const items = Array.from(containerEl.querySelectorAll('.bookmark-item'));
                const newIndex = items.findIndex(it => it.dataset && it.dataset.id === dragData.id);
                const currentChatData = ensureCurrentChatData();
                const draggedIndex = parseInt(dragData.index);
                if (isNaN(newIndex) || isNaN(draggedIndex) || newIndex === draggedIndex) return;

                const [removed] = currentChatData.bookmarks.splice(draggedIndex, 1);
                currentChatData.bookmarks.splice(newIndex > draggedIndex ? newIndex - 1 : newIndex, 0, removed);
                saveBookmarksToStorage();
                renderBookmarkList();
            } catch (error) {
                console.error('时间模式拖放处理出错:', error);
            }
        });
    }
    
    return element;
}

// 🆕 处理时间模式的书签拖拽放置
function handleTimeBookmarkDrop(e, dragData, targetBookmark, targetIndex) {
    try {
        const currentChatData = ensureCurrentChatData();
        
        const draggedIndex = parseInt(dragData.index);
        if (draggedIndex === targetIndex || isNaN(draggedIndex)) {
            console.warn('❌ 无效的拖拽操作');
                        return;
                    }
                    
        // 计算插入位置
        const rect = e.target.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
        const insertIndex = e.clientY < midY ? targetIndex : targetIndex + 1;

        // 移动书签位置
        const [removed] = currentChatData.bookmarks.splice(draggedIndex, 1);
        currentChatData.bookmarks.splice(insertIndex > draggedIndex ? insertIndex - 1 : insertIndex, 0, removed);

        console.log('📊 更新书签时间顺序:', {
                        from: draggedIndex,
                        to: insertIndex,
            bookmark: removed.summary
                    });

                    saveBookmarksToStorage();
                    renderBookmarkList();
                } catch (error) {
        console.error('处理时间模式拖放时出错:', error);
    }
}

// 🎨 创建样式
function createStyles() {
    console.log("🎨 [Debug] createStyles: Creating styles...");
    
    // 清除所有可能残留的旧样式
    const existingStyles = document.querySelectorAll('style[data-gpt-burger], style');
    existingStyles.forEach(style => {
        if (style.textContent && (
            style.textContent.includes('gpt-burger-extension-root') ||
            style.textContent.includes('gpt-bookmark-toggle') ||
            style.textContent.includes('gpt-bookmark-list')
        )) {
            console.log("🗑️ [Debug] createStyles: Removing old style element");
            style.remove();
        }
    });
    
    const style = document.createElement("style");
    style.setAttribute('data-gpt-burger', 'v1.3.5-scoped'); // 更新版本标识

    let cssContent = `
        /* ===== DEBUG INDICATOR ===== */
        #gpt-burger-root #gpt-burger-debug-indicator {
            position: fixed;
            top: 5px;
            left: 5px;
            padding: 5px;
            background-color: red;
            color: white;
            z-index: 99999;
            font-size: 10px;
            border: 1px solid white;
            text-align: center;
        }

        /* ===== TOGGLE BUTTON ===== */
        #gpt-burger-root .gpt-bookmark-toggle {
            position: fixed;
            top: var(--gptb-position-toggle-top);
            right: var(--gptb-position-toggle-right);
            width: var(--gptb-size-toggle-button);
            height: var(--gptb-size-toggle-button);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: 999px; /* 圆形 */
            background: var(--gptb-color-background-container);
            backdrop-filter: blur(10px);
            cursor: pointer;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--gptb-font-size-xl);
            box-shadow: var(--gptb-shadow-sm);
            transition: all 0.2s ease;
        }
        #gpt-burger-root .gptb-toggle-icon {
            display: inline-block;
            width: 36px;
            height: 36px;
            position: relative;
            box-sizing: border-box;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            filter: none;
        }
        
        #gpt-burger-root .gpt-bookmark-toggle:hover { box-shadow: var(--gptb-shadow-sm); transform: none; }
        
        html.dark #gpt-burger-root .gpt-bookmark-toggle {
            background: var(--gptb-color-background-container);
            border-color: var(--gptb-color-border-default);
            color: var(--gptb-color-text-primary);
        }

        /* ===== Language Switch Container under toggle ===== */
        #gpt-burger-root .lang-switch-container {
            position: fixed;
            top: calc(var(--gptb-position-toggle-top) + var(--gptb-size-toggle-button) + 8px);
            right: var(--gptb-position-toggle-right);
            display: flex; /* 允许过渡动画 */
            flex-direction: column;
            gap: 6px;
            z-index: 10000;
            width: var(--gptb-size-toggle-button);
            align-items: flex-start; /* 内部靠左 */
            pointer-events: auto;
            opacity: 1;
            transform: translateY(0);
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        #gpt-burger-root .lang-switch-container.collapsed { opacity: 0; transform: translateY(8px); pointer-events: none; }
        #gpt-burger-root .lang-switch {
            width: calc(var(--gptb-size-toggle-button) / 2); /* 直径 1/2 */
            height: calc(var(--gptb-size-toggle-button) / 2);
            border-radius: 999px; /* 圆形 */
            border: 1px solid var(--gptb-color-border-default);
            background: var(--gptb-color-background-button);
            color: var(--gptb-color-text-secondary);
            cursor: pointer;
            font-size: var(--gptb-font-size-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: none; /* 去除阴影 */
            padding: 0;
            font-weight: var(--gptb-font-weight-medium);
        }
        #gpt-burger-root .lang-switch:hover { background: var(--gptb-color-background-button-hover); color: var(--gptb-color-text-on-accent); border-color: var(--gptb-color-border-hover); box-shadow: none; }
        
        /* ===== BOOKMARK LIST ===== */
        #gpt-burger-root .gpt-bookmark-list {
            position: fixed;
            top: var(--gptb-position-sidebar-top);
            right: var(--gptb-position-sidebar-right);
            width: var(--gptb-size-container-width);
            max-height: var(--gptb-size-container-max-height);
            z-index: 9999;
            background: var(--gptb-color-background-container);
            backdrop-filter: blur(15px);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-lg);
            font-size: var(--gptb-font-size-lg);
            font-family: sans-serif;
            transition: all 0.3s ease;
            box-shadow: var(--gptb-shadow-sm);
            
            /* Flexbox Layout */
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
        }

        #gpt-burger-root .gpt-bookmark-list::-webkit-scrollbar {
            display: none;
        }
        
        #gpt-burger-root .gpt-bookmark-list.collapsed {
            opacity: 0;
            visibility: hidden;
            transform: translateX(30px) scale(0.95);
            pointer-events: none;
        }
        
        #gpt-burger-root .bookmark-content {
            display: flex;
            flex-direction: column;
            padding: var(--gptb-spacing-lg);
            flex: 1;
            overflow: hidden; /* 外层不滚动，内部列表滚动 */
        }
        
        /* 顶部操作区固定 */
        #gpt-burger-root .group-header {
            position: sticky;
            top: 0;
            z-index: 2;
            background: transparent !important; /* 强制透明 */
            padding: var(--gptb-spacing-sm) 0;
            margin-bottom: var(--gptb-spacing-lg);
            border: none;
            box-shadow: none;
        }

        /* 列表容器承担滚动 */
        #gpt-burger-root .bookmarks-scroll {
            overflow-y: auto;
            -ms-overflow-style: none;
            scrollbar-width: none;
            flex: 1;
        }
        #gpt-burger-root .bookmarks-scroll::-webkit-scrollbar { display: none; }
        
        html.dark #gpt-burger-root .gpt-bookmark-list {
            background: var(--gptb-color-background-container);
            border-color: var(--gptb-color-border-default);
            color: var(--gptb-color-text-primary);
        }
        
        /* ===== OTHER STYLES ===== */
        #gpt-burger-root .bookmark-group {
            margin-bottom: var(--gptb-spacing-md);
        }
        
        #gpt-burger-root .bookmark-group.empty {
            margin-bottom: var(--gptb-spacing-xs);
        }
        
        #gpt-burger-root .bookmark-group.empty .group-header {
            margin-bottom: var(--gptb-spacing-xs) !important;
            padding: var(--gptb-spacing-sm) var(--gptb-spacing-md) !important;
            opacity: 0.7 !important;
            background: transparent !important;
        }
        
        #gpt-burger-root .bookmarks-container.empty-hint {
            min-height: 20px;
            border: 1px dashed var(--gptb-color-border-tooltip);
            border-radius: var(--gptb-radius-sm);
            margin: var(--gptb-spacing-xxs) 0;
            opacity: 0.5;
            text-align: center;
            font-size: var(--gptb-font-size-xs);
            color: var(--text-secondary);
            padding: var(--gptb-spacing-xxs);
            transition: all 0.2s ease;
        }
        
        #gpt-burger-root .bookmarks-container.empty-hint:hover {
            opacity: 0.8;
        }
        
        html.dark #gpt-burger-root .bookmarks-container.empty-hint {
            border-color: var(--gptb-color-border-tooltip);
            color: var(--text-muted);
        }
        
        #gpt-burger-root .group-header {
            margin-bottom: var(--gptb-spacing-lg);
            padding: 0;
            border-radius: var(--gptb-radius-sm);
            background: transparent !important; /* 再次保证透明 */
        }
        
        #gpt-burger-root .group-title {
            font-weight: var(--gptb-font-weight-medium);
        }
        
        html.dark #gpt-burger-root .group-header {
            background: transparent !important; /* 去除深色下遗留背景 */
        }
        
        html.dark #gpt-burger-root .group-title {
            color: var(--gptb-color-text-primary);
        }
        
        #gpt-burger-root .bookmark-item {
            display: flex;
            align-items: flex-start; /* 垂直顶部对齐 */
            padding: var(--gptb-spacing-sm) var(--gptb-spacing-lg); /* 调整内边距 */
            margin-bottom: var(--gptb-spacing-sm); /* 调整间距 */
            border-radius: var(--gptb-radius-lg);
            border: 1px solid var(--gptb-color-border-bookmark-default);
            background: var(--gptb-color-background-item-idle);
            cursor: default;
            user-select: none;
            box-sizing: border-box;
            transition: background-color var(--gptb-animation-duration-normal), border-color var(--gptb-animation-duration-normal), transform 120ms ease;
            will-change: transform, background-color, border-color;
            transform: translateZ(0);
            backface-visibility: hidden;
            color: var(--gptb-color-text-primary);
            font-size: var(--gptb-font-size-base);
        }
        
        
        #gpt-burger-root .bookmark-item:hover {
            background: var(--gptb-color-background-item-hover);
            border: 1px solid var(--gptb-color-border-default); /* Use default border color for a subtle hover */
        }
        
        #gpt-burger-root .bookmark-item.selected {
            background: var(--gptb-color-background-item-hover);
            border: 1px solid var(--gptb-color-border-bookmark-hover);
            transform: translateY(-1px);
        }
        
        html.dark #gpt-burger-root .bookmark-item {
            background: var(--gptb-color-background-item-idle);
        }
        
        html.dark #gpt-burger-root .bookmark-item:hover {
            background: var(--gptb-color-background-item-hover);
            border: 1px solid var(--gptb-color-border-bookmark-hover);
            transform: translateY(-1px);
        }
        
        html.dark #gpt-burger-root .bookmark-item.selected {
            background: var(--gptb-color-background-item-hover);
            border: 1px solid var(--gptb-color-border-bookmark-hover);
            transform: translateY(-1px);
        }
        
        #gpt-burger-root .bookmark-item.dragging {
            opacity: 1; /* 拖拽时不降低不透明度，避免"模糊感" */
            background: var(--gptb-color-background-item-hover);
            transform: rotate(2deg) scale(1.02);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
            z-index: 1000;
        }
        
        html.dark #gpt-burger-root .bookmark-item.dragging {
            background: var(--gptb-color-background-item-hover);
            transform: rotate(2deg) scale(1.02);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
            z-index: 1000;
        }

        /* 拖拽时的原位置占位元素（浅色填充区域） */
        #gpt-burger-root .bookmark-placeholder,
        #gpt-burger-root .bookmark-as-placeholder {
            border-radius: var(--gptb-radius-lg);
            background: var(--gptb-color-background-item-hover);
        }

        /* 夹缝位置的指示线（与主题色一致） */
        #gpt-burger-root .drop-indicator {
            height: 3px;
            margin: 4px var(--gptb-spacing-lg);
            border-radius: 2px;
            background: var(--gptb-color-border-hover);
        }

        /* 自定义拖拽预览（跟随鼠标的倾斜书签） */
        #gpt-burger-root .drag-image {
            pointer-events: none;
            transform: rotate(-2deg) scale(1.02);
            opacity: 0.9;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            filter: none;
            -webkit-filter: none;
            backdrop-filter: none;
            -webkit-backdrop-filter: none; /* 明确禁用任何模糊效果 */
        }
        html.dark #gpt-burger-root .drag-image {
            box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }

        /* 拖拽"小标签"样式（与书签风格一致，仅标题） */
        #gpt-burger-root .drag-mini-tag {
            padding: 4px 10px;
            border-radius: var(--gptb-radius-lg);
            color: var(--gptb-color-text-primary);
            font-size: var(--gptb-font-size-base);
            line-height: 1.2;
            background: var(--gptb-color-background-item-hover);
            border: 1px solid var(--gptb-color-border-default);
            box-shadow: var(--gptb-shadow-sm);
            white-space: nowrap;
            max-width: 240px;
            overflow: hidden;
            text-overflow: ellipsis;
            pointer-events: none;
        }
        html.dark #gpt-burger-root .drag-mini-tag {
            color: var(--gptb-color-text-primary);
            background: var(--gptb-color-background-item-hover);
            border-color: var(--gptb-color-border-default);
        }
        
        #gpt-burger-root .bookmark-text-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden; /* 关键：确保容器本身不滚动，而是控制子元素 */
            line-height: var(--gptb-line-height-tight);
            min-height: 0; /* 新增：允许flex item收缩，触发内部滚动 */
            max-height: 120px; /* 关键：限制文本容器的高度 */
        }

        #gpt-burger-root .bookmark-title-display {
            font-weight: bold;
            white-space: pre-wrap;
            word-break: break-word;
            flex-shrink: 0; /* 防止标题在flex布局中被压缩 */
        }

        #gpt-burger-root .bookmark-summary {
            flex: 1; /* 占据剩余空间 */
            white-space: pre-wrap;
            word-break: break-word;
            opacity: 0.8;
            overflow-y: auto; /* 关键：只让正文滚动 */
            margin-top: 2px; /* 标题和正文之间一个微小的间距 */
            -ms-overflow-style: none;
            scrollbar-width: none;
        }

        #gpt-burger-root .bookmark-summary::-webkit-scrollbar {
            display: none;
        }

        /* 拖拽时禁用正文滚动，防误触 */
        #gpt-burger-root .bookmark-item.dragging .bookmark-summary,
        #gpt-burger-root .bookmark-item.dragging * {
            overscroll-behavior: contain;
            scroll-behavior: auto;
            pointer-events: none;
        }

        /* Seamless editing styles */
        #gpt-burger-root .bookmark-edit-input,
        #gpt-burger-root .bookmark-edit-input:focus {
            width: 100%;
            background: transparent;
            border: none;
            padding: 0;
            margin: 0;
            outline: none;
            box-shadow: none;
            box-sizing: border-box;
            color: inherit;
        }
        
        #gpt-burger-root textarea.bookmark-edit-input {
            resize: vertical;
        }
        
        /* 移除拖拽句柄相关样式 */
        
        #gpt-burger-root .bookmark-actions {
            display: flex;
            gap: var(--gptb-spacing-xs);
            margin-left: var(--gptb-spacing-md);
        }
        
        #gpt-burger-root .bookmark-actions button {
            border: none;
            background: none;
            cursor: pointer;
            padding: var(--gptb-spacing-xxs) var(--gptb-spacing-xs);
            opacity: 0.7;
            transition: opacity 0.2s;
        }
        
        #gpt-burger-root .bookmark-actions button:hover {
            opacity: 1;
        }
        
        /* kebab + 内联编辑面板 */
        #gpt-burger-root .bookmark-kebab-btn {
            width: 20px;
            height: 20px;
            line-height: 20px;
            text-align: center;
            font-size: 16px;
            color: var(--gptb-color-text-secondary);
        }
        
        #gpt-burger-root .bookmark-inline-editor-panel {
            margin-top: 4px;
            margin-bottom: 8px;
            padding: 8px 10px;
            border-radius: var(--gptb-radius-lg);
            border: 1px solid var(--gptb-color-border-default);
            background: var(--gptb-color-background-container);
            display: flex;
            flex-direction: column;
            gap: var(--gptb-spacing-sm);
        }
        #gpt-burger-root .bookmark-inline-editor-row {
            display: flex;
            gap: var(--gptb-spacing-sm);
            align-items: center;
            justify-content: center;
        }
        #gpt-burger-root .bookmark-inline-editor-row.row-top {
            justify-content: center;
        }
        #gpt-burger-root .bookmark-inline-editor-row.row-bottom {
            justify-content: center;
        }
        #gpt-burger-root .inline-editor-delete-btn,
        #gpt-burger-root .inline-editor-remove-btn {
            padding: 0 var(--gptb-spacing-md);
            height: var(--gptb-size-button-height);
            border-radius: var(--gptb-radius-lg);
            border: 1px solid var(--gptb-color-border-default);
            background: var(--gptb-color-background-button);
            color: var(--gptb-color-text-secondary);
            font-size: var(--gptb-font-size-sm);
            cursor: pointer;
        }
        #gpt-burger-root .inline-editor-delete-btn:hover,
        #gpt-burger-root .inline-editor-remove-btn:hover {
            background: var(--gptb-color-background-button-hover);
            color: var(--gptb-color-text-on-accent);
            border-color: var(--gptb-color-border-hover);
        }
        
        #gpt-burger-root .bookmark-checkbox {
            width: var(--gptb-size-checkbox);
            height: var(--gptb-size-checkbox);
            border-radius: var(--gptb-radius-full);
            border: 1px solid var(--gptb-color-border-default);
            background: #ffffff;
            cursor: pointer;
            margin-right: var(--gptb-spacing-lg);
            transition: all 0.2s ease;
            position: relative;
            appearance: none;
            -webkit-appearance: none;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
                  #gpt-burger-root .bookmark-checkbox:hover {
              background: #ffffff;
              border-color: var(--gptb-color-border-hover);
          }

          /* 分组复选框边框颜色 */
          #gpt-burger-root .bookmark-item.dynamic-color-1 .bookmark-checkbox {
              border-color: var(--gptb-color-group-1-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-2 .bookmark-checkbox {
              border-color: var(--gptb-color-group-2-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-3 .bookmark-checkbox {
              border-color: var(--gptb-color-group-3-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-4 .bookmark-checkbox {
              border-color: var(--gptb-color-group-4-border);
          }
          
          /* 分组复选框hover边框颜色 */
          #gpt-burger-root .bookmark-item.dynamic-color-1 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-1-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-2 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-2-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-3 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-3-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-4 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-4-border);
          }
        
        #gpt-burger-root .bookmark-checkbox:checked {
            background: var(--gptb-color-background-button-hover);
            border-color: var(--gptb-color-background-button-hover);
        }
        
        #gpt-burger-root .bookmark-checkbox:checked::after {
            content: '';
            width: 4px;
            height: 4px;
            background: #ffffff;
            border-radius: 50%;
            position: absolute;
        }
        
        #gpt-burger-root .bookmark-checkbox:focus {
            outline: none;
            box-shadow: none;
        }
        

        
        /* ===== DARK THEME CHECKBOXES ===== */
        html.dark #gpt-burger-root .bookmark-checkbox {
            border-color: var(--gptb-color-border-hover);
            background: #ffffff;
        }
        
        html.dark           #gpt-burger-root .bookmark-checkbox:hover {
              background: #ffffff;
              border-color: var(--gptb-color-border-hover);
          }

          /* 分组复选框边框颜色 */
          #gpt-burger-root .bookmark-item.dynamic-color-1 .bookmark-checkbox {
              border-color: var(--gptb-color-group-1-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-2 .bookmark-checkbox {
              border-color: var(--gptb-color-group-2-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-3 .bookmark-checkbox {
              border-color: var(--gptb-color-group-3-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-4 .bookmark-checkbox {
              border-color: var(--gptb-color-group-4-border);
          }
          
          /* 分组复选框hover边框颜色 */
          #gpt-burger-root .bookmark-item.dynamic-color-1 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-1-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-2 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-2-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-3 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-3-border);
          }
          
          #gpt-burger-root .bookmark-item.dynamic-color-4 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-4-border);
          }
        
        html.dark #gpt-burger-root .bookmark-checkbox:checked {
            background: var(--gptb-color-background-button-hover);
            border-color: var(--gptb-color-background-button-hover);
        }
        
                  html.dark #gpt-burger-root .bookmark-checkbox:checked::after {
              background: #ffffff;
          }

          /* 暗色主题分组复选框边框颜色 */
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-1 .bookmark-checkbox {
              border-color: var(--gptb-color-group-1-border);
          }
          
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-2 .bookmark-checkbox {
              border-color: var(--gptb-color-group-2-border);
          }
          
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-3 .bookmark-checkbox {
              border-color: var(--gptb-color-group-3-border);
          }
          
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-4 .bookmark-checkbox {
              border-color: var(--gptb-color-group-4-border);
          }
          
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-1 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-1-border);
          }
          
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-2 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-2-border);
          }
          
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-3 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-3-border);
          }
          
          html.dark #gpt-burger-root .bookmark-item.dynamic-color-4 .bookmark-checkbox:hover {
              border-color: var(--gptb-color-group-4-border);
          }
        
        #gpt-burger-root .group-checkbox {
            margin-right: var(--gptb-spacing-xs);
            cursor: pointer;
        }
        
        #gpt-burger-root .batch-actions button:hover {
            opacity: 0.9;
        }
        
        html.dark #gpt-burger-root .batch-actions {
            background: #343541; /* Legacy color, consider tokenizing if needed */
        }
        
        #gpt-burger-root .bookmark-group:not(.manage-mode) {
            cursor: move;
            user-select: none;
        }
        
        #gpt-burger-root .bookmark-group.dragging {
            opacity: 0.5;
            background: #f0f0f0; /* Legacy color, consider tokenizing if needed */
        }
        
        #gpt-burger-root .bookmark-group.drag-target {
            background: rgba(44, 115, 210, 0.1); /* Legacy color, consider tokenizing if needed */
        }

        /* ===== TOOLTIP ===== */
        #gpt-burger-root .bookmark-原文-tooltip {
            position: fixed;
            background: var(--gptb-color-background-tooltip);
            color: var(--gptb-color-text-primary);
            border: 1px solid var(--gptb-color-border-tooltip);
            padding: var(--gptb-spacing-lg);
            border-radius: var(--gptb-radius-sm);
            box-shadow: var(--gptb-shadow-lg);
            z-index: 10001;
            max-width: var(--gptb-size-tooltip-max-width);
            font-size: var(--gptb-font-size-base);
            line-height: var(--gptb-line-height-normal);
            word-wrap: break-word;
            pointer-events: none;
            white-space: pre-wrap;
        }

        html.dark #gpt-burger-root .bookmark-原文-tooltip {
            background: var(--gptb-color-background-tooltip);
            color: var(--gptb-color-text-secondary);
            border-color: var(--gptb-color-border-tooltip);
        }

        /* ===== CSS变量定义 ===== */
        #gpt-burger-root {
            /* ----------------------------------------- */
            /*           GPT Burger Design Tokens        */
            /* ----------------------------------------- */

            /* ===== Colors ===== */
            /* -- Text -- */
            --gptb-color-text-primary: #1e293b;
            --gptb-color-text-secondary: #64748b;
            --gptb-color-text-on-accent: #ffffff;

            /* -- Backgrounds -- */
            --gptb-color-background-container: rgba(255, 255, 255, 0.95);
            --gptb-color-background-button: rgba(255, 255, 255, 0.8);
            --gptb-color-background-button-save: rgba(255, 255, 255, 0.95);
            --gptb-color-background-button-hover: #334155;
            --gptb-color-background-item-idle: rgba(245, 245, 245, 0.1);
            --gptb-color-background-item-hover: rgba(245, 245, 245, 0.3);
            --gptb-color-background-tooltip: rgba(255, 255, 255, 0.8);

            /* -- Borders -- */
            --gptb-color-border-default: #e2e8f0;
            --gptb-color-border-hover: #334155;
            --gptb-color-border-tooltip: #ccc;
            --gptb-color-border-bookmark-default: transparent;
            --gptb-color-border-bookmark-hover: var(--gptb-color-border-hover);
            
            /* -- Checkbox Colors -- */
            --gptb-color-checkbox-border: var(--gptb-color-border-default);
            --gptb-color-checkbox-border-hover: var(--gptb-color-border-hover);
            --gptb-color-checkbox-border-selected: var(--gptb-color-border-hover);
            --gptb-color-checkbox-bg: transparent;
            --gptb-color-checkbox-bg-hover: var(--gptb-color-background-item-hover);
            --gptb-color-checkbox-bg-selected: var(--gptb-color-background-item-hover);

            /* -- Group Theme Hues -- */
            --gptb-hue-group-1: 221, 57%, 85%;  /* #C5D2ED - Periwinkle (Blue) */
            --gptb-hue-group-2: 185, 41%, 62%;  /* #7DCCD5 - Green (Blue-green) */
            --gptb-hue-group-3: 90, 70%, 80%;   /* #D9F0B3 - Greener (Yellow-green) */
            --gptb-hue-group-4: 60, 76%, 67%;   /* #EBEB7C - Yellow */

            /* -- Group 1 -- */
            --gptb-color-group-1-bg: hsla(var(--gptb-hue-group-1), 0.1);
            --gptb-color-group-1-bg-hover: hsl(221, 60%, 95%);
            --gptb-color-group-1-bg-selected: hsl(221, 60%, 95%);
            --gptb-color-group-1-border: hsl(var(--gptb-hue-group-1));

            /* -- Group 2 -- */
            --gptb-color-group-2-bg: hsla(var(--gptb-hue-group-2), 0.1);
            --gptb-color-group-2-bg-hover: hsl(185, 40%, 95%);
            --gptb-color-group-2-bg-selected: hsl(185, 40%, 95%);
            --gptb-color-group-2-border: hsl(var(--gptb-hue-group-2));

            /* -- Group 3 -- */
            --gptb-color-group-3-bg: hsla(var(--gptb-hue-group-3), 0.1);
            --gptb-color-group-3-bg-hover: hsl(90, 60%, 95%);
            --gptb-color-group-3-bg-selected: hsl(90, 60%, 95%);
            --gptb-color-group-3-border: hsl(var(--gptb-hue-group-3));

            /* -- Group 4 -- */
            --gptb-color-group-4-bg: hsla(var(--gptb-hue-group-4), 0.1);
            --gptb-color-group-4-bg-hover: hsl(60, 60%, 95%);
            --gptb-color-group-4-bg-selected: hsl(60, 60%, 95%);
            --gptb-color-group-4-border: hsl(var(--gptb-hue-group-4));

            /* ===== Legacy Vars (to be deprecated) ===== */
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --bg-card: rgba(249, 250, 254, 0.95);
            --text-primary: #1e293b;
            --text-secondary: #64748b;
            --text-muted: #94a3b8;
            --border-color: #e2e8f0;
            --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            --radius: 16px;
            --radius-sm: 8px;

            /* ===== Sizing, Spacing, Radius ===== */
            /* -- Radius -- */
            --gptb-radius-full: 50%;
            --gptb-radius-lg: 16px;
            --gptb-radius-md: 8px;
            --gptb-radius-sm: 4px;

            /* -- Spacing -- */
            --gptb-spacing-xxs: 2px;
            --gptb-spacing-xs: 4px;
            --gptb-spacing-sm: 6px;
            --gptb-spacing-md: 8px;
            --gptb-spacing-lg: 10px;
            --gptb-spacing-xl: 12px;

            /* -- Sizing -- */
            --gptb-size-button-height: 22px;
            --gptb-size-button-icon: 22px;
            --gptb-size-checkbox: 16px;
            --gptb-size-toggle-button: 48px;
            --gptb-size-container-width: 240px; /* 192px * 1.25 */
            --gptb-size-popup-width: 240px;
            --gptb-size-container-max-height: 540px; /* 360px * 1.5 */
            --gptb-size-tooltip-max-width: 350px;
            
            /* -- Bookmark Height Tokens -- */
            --gptb-bookmark-height-standard: 30px;
            --gptb-bookmark-height-expanded: 50px;
            --gptb-bookmark-height-hover: 64px;
            --gptb-bookmark-min-height-hover: 36px;
            
            /* -- Animation Tokens -- */
            --gptb-animation-duration-fast: 0.15s;
            --gptb-animation-duration-normal: 0.25s;
            --gptb-animation-duration-slow: 0.3s;
            --gptb-animation-easing: cubic-bezier(0.4, 0, 0.2, 1);
            --gptb-animation-easing-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);

            /* -- Positioning -- */
            --gptb-position-toggle-top: 100px;
            --gptb-position-toggle-right: 20px;
            --gptb-position-sidebar-top: 100px;
            --gptb-position-sidebar-right: 80px;

            /* ===== Typography & Shadows ===== */
            /* -- Font Sizes -- */
            --gptb-font-size-xs: 11px;
            --gptb-font-size-sm: 12px;
            --gptb-font-size-base: 13px;
            --gptb-font-size-lg: 14px;
            --gptb-font-size-xl: 20px;

            /* -- Font Weights -- */
            --gptb-font-weight-normal: 400;
            --gptb-font-weight-medium: 500;

            /* -- Line Heights -- */
            --gptb-line-height-tight: 1.4;
            --gptb-line-height-normal: 1.5;

            /* -- Shadows -- */
            --gptb-shadow-sm: 0 1px 4px rgba(0,0,0,0.1);
            --gptb-shadow-md: 0 4px 12px rgba(0,0,0,0.2);
            --gptb-shadow-lg: 0 2px 8px rgba(0,0,0,0.15);
        }

        /* 深色主题 */
        html.dark #gpt-burger-root {
            /* -- Text -- */
            --gptb-color-text-primary: #f1f5f9;
            --gptb-color-text-secondary: #cbd5e1;

            /* -- Backgrounds -- */
            --gptb-color-background-container: rgba(32, 33, 35, 0.95);
            --gptb-color-background-button: rgba(17, 24, 39, 0.8);
            --gptb-color-background-button-save: rgba(17, 24, 39, 0.95);
            --gptb-color-background-item-idle: rgba(52, 53, 65, 0.1);
            --gptb-color-background-item-hover: rgba(52, 53, 65, 0.3);
            --gptb-color-background-tooltip: rgba(40, 42, 46, 0.8);

            /* -- Borders -- */
            --gptb-color-border-default: #334155;
            --gptb-color-border-hover: #64748b;
            --gptb-color-border-tooltip: #4a4b4d;
            --gptb-color-border-bookmark-default: transparent;
            --gptb-color-border-bookmark-hover: var(--gptb-color-border-hover);
            
            /* -- Checkbox Colors -- */
            --gptb-color-checkbox-border: var(--gptb-color-border-default);
            --gptb-color-checkbox-border-hover: var(--gptb-color-border-hover);
            --gptb-color-checkbox-border-selected: var(--gptb-color-border-hover);
            --gptb-color-checkbox-bg: transparent;
            --gptb-color-checkbox-bg-hover: var(--gptb-color-background-item-hover);
            --gptb-color-checkbox-bg-selected: var(--gptb-color-background-item-hover);

            /* ===== Legacy Vars (to be deprecated) ===== */
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #1e293b;
            --text-primary: #f1f5f9;
            --text-secondary: #cbd5e1;
            --text-muted: #64748b;
            --border-color: #334155;
        }

        /* ===== 全新紧凑型保存弹窗 ===== */
        #gpt-burger-root .compact-save-popup {
            width: var(--gptb-size-popup-width);
            background: var(--gptb-color-background-container);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-lg);
            padding: var(--gptb-spacing-lg);
            box-shadow: var(--gptb-shadow-sm);
            backdrop-filter: blur(15px);
            display: flex;
            flex-direction: column;
            gap: var(--gptb-spacing-lg);
            z-index: 10000;
        }

        html.dark #gpt-burger-root .compact-save-popup {
            background: var(--gptb-color-background-container);
            border-color: var(--gptb-color-border-default);
        }

        #gpt-burger-root .compact-bookmark-name {
            width: 100%;
            background: transparent !important;
            border: none;
            padding: var(--gptb-spacing-xs) var(--gptb-spacing-xxs);
            color: var(--gptb-color-text-primary) !important;
            font-size: var(--gptb-font-size-base);
            box-sizing: border-box;
            transition: all 0.2s ease;
        }

        #gpt-burger-root .compact-bookmark-name:focus {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
            color: var(--gptb-color-text-primary) !important;
        }

        #gpt-burger-root .compact-popup-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #gpt-burger-root .compact-quick-groups {
            display: flex;
            align-items: center;
            gap: var(--gptb-spacing-sm);
        }

        #gpt-burger-root .compact-group-btn {
            width: var(--gptb-size-button-icon);
            height: var(--gptb-size-button-icon);
            border-radius: var(--gptb-radius-full);
            border: 1px solid var(--gptb-color-border-default);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        /* ===== UNIFIED GROUP/BOOKMARK COLOR STYLES ===== */

        /* --- Group 1 --- */
        #gpt-burger-root .compact-group-btn.group-style-1,
        #gpt-burger-root .bookmark-item.dynamic-color-1 {
            background-color: var(--gptb-color-group-1-bg) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-1:hover {
            background-color: var(--gptb-color-group-1-bg-hover) !important;
            border-color: var(--gptb-color-group-1-border) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-1.selected {
            background-color: var(--gptb-color-group-1-bg-selected) !important;
            border-color: var(--gptb-color-group-1-border) !important;
        }
        #gpt-burger-root .bookmark-item.dynamic-color-1:hover,
        #gpt-burger-root .bookmark-item.dynamic-color-1.selected {
            background-color: var(--gptb-color-group-1-bg-hover) !important;
        }

        /* --- Group 2 --- */
        #gpt-burger-root .compact-group-btn.group-style-2,
        #gpt-burger-root .bookmark-item.dynamic-color-2 {
            background-color: var(--gptb-color-group-2-bg) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-2:hover {
            background-color: var(--gptb-color-group-2-bg-hover) !important;
            border-color: var(--gptb-color-group-2-border) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-2.selected {
            background-color: var(--gptb-color-group-2-bg-selected) !important;
            border-color: var(--gptb-color-group-2-border) !important;
        }
        #gpt-burger-root .bookmark-item.dynamic-color-2:hover,
        #gpt-burger-root .bookmark-item.dynamic-color-2.selected {
            background-color: var(--gptb-color-group-2-bg-hover) !important;
        }

        /* --- Group 3 --- */
        #gpt-burger-root .compact-group-btn.group-style-3,
        #gpt-burger-root .bookmark-item.dynamic-color-3 {
            background-color: var(--gptb-color-group-3-bg) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-3:hover {
            background-color: var(--gptb-color-group-3-bg-hover) !important;
            border-color: var(--gptb-color-group-3-border) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-3.selected {
            background-color: var(--gptb-color-group-3-bg-selected) !important;
            border-color: var(--gptb-color-group-3-border) !important;
        }
        #gpt-burger-root .bookmark-item.dynamic-color-3:hover,
        #gpt-burger-root .bookmark-item.dynamic-color-3.selected {
            background-color: var(--gptb-color-group-3-bg-hover) !important;
        }

        /* --- Group 4 --- */
        #gpt-burger-root .compact-group-btn.group-style-4,
        #gpt-burger-root .bookmark-item.dynamic-color-4 {
            background-color: var(--gptb-color-group-4-bg) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-4:hover {
            background-color: var(--gptb-color-group-4-bg-hover) !important;
            border-color: var(--gptb-color-group-4-border) !important;
        }
        #gpt-burger-root .compact-group-btn.group-style-4.selected {
            background-color: var(--gptb-color-group-4-bg-selected) !important;
            border-color: var(--gptb-color-group-4-border) !important;
        }
        #gpt-burger-root .bookmark-item.dynamic-color-1:hover {
            border: 1px solid var(--gptb-color-group-1-border) !important;
        }
        
        #gpt-burger-root .bookmark-item.dynamic-color-2:hover {
            border: 1px solid var(--gptb-color-group-2-border) !important;
        }
        
        #gpt-burger-root .bookmark-item.dynamic-color-3:hover {
            border: 1px solid var(--gptb-color-group-3-border) !important;
        }
        
        #gpt-burger-root .bookmark-item.dynamic-color-4:hover {
            border: 1px solid var(--gptb-color-group-4-border) !important;
        }

        #gpt-burger-root .compact-save-btn {
            padding: 0 var(--gptb-spacing-lg);
            border-radius: var(--gptb-radius-lg);
            border: 1px solid var(--gptb-color-border-default);
            background: var(--gptb-color-background-button-save) !important;
            color: var(--gptb-color-text-secondary);
            cursor: pointer;
            font-size: var(--gptb-font-size-sm);
            font-weight: var(--gptb-font-weight-medium);
            transition: all 0.2s ease;
            height: var(--gptb-size-button-height);
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #gpt-burger-root .compact-save-btn:hover {
            background: var(--gptb-color-background-button-hover) !important;
            color: var(--gptb-color-text-on-accent);
            border-color: var(--gptb-color-border-hover);
        }

        /* 深色主题下的保存按钮样式 */
        html.dark #gpt-burger-root .compact-save-btn {
            background: var(--gptb-color-background-button-save) !important;
        }

        /* 颜色选择动效 */
        #gpt-burger-root .compact-save-popup.color-transition {
            transition: background-color 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes colorRipple {
            0% {
                transform: scale(0);
                opacity: 0.8;
            }
            50% {
                opacity: 0.4;
            }
            100% {
                transform: scale(4);
                opacity: 0;
            }
        }

        #gpt-burger-root .color-ripple-effect {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            pointer-events: none;
            animation: colorRipple 0.8s ease-out;
            transform: translate(-50%, -50%);
        }

        /* 统一按钮样式 - 与save按钮保持一致 */
        #gpt-burger-root .save-btn,
        #gpt-burger-root .select-all-btn,
        #gpt-burger-root .batch-move-btn,
        #gpt-burger-root .batch-export-btn,
        #gpt-burger-root .batch-delete-btn,
        #gpt-burger-root .organize-export-btn,
        #gpt-burger-root .sort-btn,
        #gpt-burger-root .copy-btn,
        #gpt-burger-root .bake-btn,
        #gpt-burger-root .lang-toggle-btn,
        #gpt-burger-root .manage-btn,
        #gpt-burger-root .export-confirm-btn,
        #gpt-burger-root .export-cancel-btn {
            padding: 0 var(--gptb-spacing-md); /* 减小内边距 */
            border-radius: var(--gptb-radius-lg); /* 统一为大圆角 */
            border: 1px solid var(--gptb-color-border-default);
            background: var(--gptb-color-background-button) !important;
            color: var(--gptb-color-text-secondary);
            cursor: pointer;
            font-size: var(--gptb-font-size-sm);
            font-weight: var(--gptb-font-weight-medium);
            transition: all 0.2s ease;
            height: var(--gptb-size-button-height);
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #gpt-burger-root .bake-btn { font-style: italic; }

        #gpt-burger-root .save-btn:hover,
        #gpt-burger-root .select-all-btn:hover,
        #gpt-burger-root .batch-move-btn:hover,
        #gpt-burger-root .batch-export-btn:hover,
        #gpt-burger-root .batch-delete-btn:hover,
        #gpt-burger-root .organize-export-btn:hover,
        #gpt-burger-root .sort-btn:hover,
        #gpt-burger-root .copy-btn:hover,
        #gpt-burger-root .bake-btn:hover,
        #gpt-burger-root .lang-toggle-btn:hover,
        #gpt-burger-root .manage-btn:hover,
        #gpt-burger-root .export-confirm-btn:hover,
        #gpt-burger-root .export-cancel-btn:hover {
            background: var(--gptb-color-background-button-hover) !important;
            color: var(--gptb-color-text-on-accent);
            border-color: var(--gptb-color-border-hover);
        }

        /* 深色主题下的统一按钮样式 */
        html.dark #gpt-burger-root .save-btn,
        html.dark #gpt-burger-root .select-all-btn,
        html.dark #gpt-burger-root .batch-move-btn,
        html.dark #gpt-burger-root .batch-export-btn,
        html.dark #gpt-burger-root .batch-delete-btn,
        html.dark #gpt-burger-root .organize-export-btn,
        html.dark #gpt-burger-root .sort-btn,
        html.dark #gpt-burger-root .manage-btn,
        html.dark #gpt-burger-root .export-confirm-btn,
        html.dark #gpt-burger-root .export-cancel-btn {
            background: var(--gptb-color-background-button) !important;
        }

        /* ===== Export Modal (match tokens) ===== */
        #gpt-burger-root .export-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.25);
            z-index: 10000;
        }
        #gpt-burger-root .export-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: calc(var(--gptb-size-popup-width) + 80px);
            max-width: 520px;
            background: var(--gptb-color-background-container);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-lg);
            padding: var(--gptb-spacing-lg);
            box-shadow: var(--gptb-shadow-lg);
            z-index: 10001;
            display: flex;
            flex-direction: column;
            gap: var(--gptb-spacing-md);
        }
        #gpt-burger-root .export-modal-title {
            font-size: var(--gptb-font-size-lg);
            font-weight: var(--gptb-font-weight-medium);
            color: var(--gptb-color-text-primary);
        }
        #gpt-burger-root .export-modal-desc {
            font-size: var(--gptb-font-size-xs);
            color: var(--gptb-color-text-secondary);
        }
        #gpt-burger-root .export-options {
            display: flex;
            flex-direction: column;
            gap: var(--gptb-spacing-sm);
            max-height: 300px;
            overflow-y: auto;
        }
        #gpt-burger-root .export-option {
            display: flex;
            align-items: flex-start;
            gap: var(--gptb-spacing-sm);
            padding: var(--gptb-spacing-sm) var(--gptb-spacing-md);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-md);
            cursor: pointer;
            background: transparent;
            transition: border-color var(--gptb-animation-duration-fast), background var(--gptb-animation-duration-fast);
        }
        #gpt-burger-root .export-option:hover {
            background: var(--gptb-color-background-item-hover);
            border-color: var(--gptb-color-border-hover);
        }
        #gpt-burger-root .export-option.selected {
            background: var(--gptb-color-background-item-hover);
            border-color: var(--gptb-color-border-hover);
        }
        #gpt-burger-root .export-option input[type="radio"] {
            margin-top: 2px;
        }
        #gpt-burger-root .export-option-text {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        #gpt-burger-root .export-option-title {
            color: var(--gptb-color-text-primary);
            font-weight: var(--gptb-font-weight-medium);
        }
        #gpt-burger-root .export-option-hint {
            color: var(--gptb-color-text-secondary);
            font-size: var(--gptb-font-size-xs);
        }
        #gpt-burger-root .export-custom-prompt {
            display: none;
        }
        #gpt-burger-root .export-custom-prompt input {
            width: 100%;
            padding: var(--gptb-spacing-xs) var(--gptb-spacing-md);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-md);
            background: var(--gptb-color-background-container);
            color: var(--gptb-color-text-primary);
        }
        #gpt-burger-root .export-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: var(--gptb-spacing-sm);
            margin-top: var(--gptb-spacing-sm);
        }

        /* 新版导出弹窗 - 引导与预设、编辑区域、预览栅格 */
        #gpt-burger-root .export-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--gptb-spacing-sm);
        }
        #gpt-burger-root .export-quick-actions {
            display: flex;
            gap: var(--gptb-spacing-sm);
        }
        #gpt-burger-root .export-preset-chips {
            display: flex;
            gap: var(--gptb-spacing-sm);
            flex-wrap: wrap;
        }
        #gpt-burger-root .preset-chip {
            padding: 2px 8px;
            border-radius: var(--gptb-radius-md);
            border: 1px solid var(--gptb-color-border-default);
            background: var(--gptb-color-background-button);
            color: var(--gptb-color-text-secondary);
            font-size: var(--gptb-font-size-xs);
            cursor: pointer;
            transition: all 0.2s ease;
        }
        #gpt-burger-root .preset-chip:hover,
        #gpt-burger-root .preset-chip.active {
            background: var(--gptb-color-background-button-hover);
            color: var(--gptb-color-text-on-accent);
            border-color: var(--gptb-color-border-hover);
        }
        #gpt-burger-root .export-textareas {
            display: flex;
            flex-direction: column;
            gap: var(--gptb-spacing-sm);
        }
        #gpt-burger-root .export-textareas textarea {
            width: 100%;
            min-height: 64px;
            padding: var(--gptb-spacing-sm) var(--gptb-spacing-md);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-md);
            background: var(--gptb-color-background-container);
            color: var(--gptb-color-text-primary);
            resize: vertical;
            font-size: var(--gptb-font-size-sm);
            line-height: 1.5;
        }
        /* 摘取正文：可编辑 + 字号更小 */
        #gpt-burger-root .export-content-input {
            width: 100%;
            min-height: 160px;
            padding: var(--gptb-spacing-sm) var(--gptb-spacing-md);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-md);
            background: var(--gptb-color-background-container);
            color: var(--gptb-color-text-primary);
            resize: vertical;
            white-space: pre-wrap;
            font-size: var(--gptb-font-size-xs);
            line-height: 1.5;
            margin: 8px 0;
        }
        #gpt-burger-root .export-preview-grid {
            display: flex;
            gap: var(--gptb-spacing-sm);
            overflow-x: auto;
            padding: var(--gptb-spacing-xs) 0;
        }
        #gpt-burger-root .export-preview-card {
            flex: 0 0 160px;
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-md);
            background: var(--gptb-color-background-item-idle);
            padding: var(--gptb-spacing-sm);
            box-sizing: border-box;
        }
        #gpt-burger-root .export-preview-title {
            font-weight: var(--gptb-font-weight-medium);
            color: var(--gptb-color-text-primary);
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #gpt-burger-root .export-preview-summary {
            color: var(--gptb-color-text-secondary);
            font-size: var(--gptb-font-size-xs);
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        
        /* 动态高度和展开动画相关规则已移除 */
        
        /* 颜色选择动效 */
        #gpt-burger-root .compact-save-popup.color-transition {
            transition: background-color 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

                /* 弹窗背景色和边框色 */
        #gpt-burger-root .compact-save-popup.group-selected-1 {
            background-color: var(--gptb-color-group-1-bg-selected) !important;
            border-color: var(--gptb-color-group-1-border) !important;
        }
        #gpt-burger-root .compact-save-popup.group-selected-1 .compact-save-btn {
            border-color: var(--gptb-color-group-1-border) !important;
        }

        #gpt-burger-root .compact-save-popup.group-selected-2 {
            background-color: var(--gptb-color-group-2-bg-selected) !important;
            border-color: var(--gptb-color-group-2-border) !important;
        }
        #gpt-burger-root .compact-save-popup.group-selected-2 .compact-save-btn {
            border-color: var(--gptb-color-group-2-border) !important;
        }

        #gpt-burger-root .compact-save-popup.group-selected-3 {
            background-color: var(--gptb-color-group-3-bg-selected) !important;
            border-color: var(--gptb-color-group-3-border) !important;
        }
        #gpt-burger-root .compact-save-popup.group-selected-3 .compact-save-btn {
            border-color: var(--gptb-color-group-3-border) !important;
        }

        #gpt-burger-root .compact-save-popup.group-selected-4 {
            background-color: var(--gptb-color-group-4-bg-selected) !important;
            border-color: var(--gptb-color-group-4-border) !important;
        }
        #gpt-burger-root .compact-save-popup.group-selected-4 .compact-save-btn {
            border-color: var(--gptb-color-group-4-border) !important;
        }

        @keyframes colorRipple {
            0% {
                transform: scale(0);
                opacity: 0.8;
            }
            50% {
                opacity: 0.4;
            }
            100% {
                transform: scale(4);
                opacity: 0;
            }
        }

        /* ===== 批量操作栏 ===== */
        #gpt-burger-root .batch-actions-container {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: var(--gptb-spacing-sm) var(--gptb-spacing-lg) var(--gptb-spacing-lg);
            border-top: 1px solid var(--gptb-color-border-default);
            background: var(--gptb-color-background-container);
            backdrop-filter: blur(10px);
            display: none; /* 默认隐藏 */
            flex-direction: column;
            gap: 6px;
            text-align: center;
        }

        #gpt-burger-root .gpt-bookmark-list.manage-mode .batch-actions-container {
            display: none; /* 默认隐藏，通过JavaScript控制显示 */
        }
        
        #gpt-burger-root .gpt-bookmark-list.manage-mode .batch-actions-container.has-selected {
            display: flex; /* 只有在选中书签时才显示 */
        }
        
        #gpt-burger-root .gpt-bookmark-list.manage-mode .bookmark-content {
            padding-bottom: 70px; /* 为悬浮的操作栏留出空间 */
        }

        #gpt-burger-root .batch-actions-buttons {
            display: flex;
            gap: 6px; /* 减小间隙 */
            justify-content: center; /* 使用 Flexbox 的方式居中 */
        }

        #gpt-burger-root .batch-actions-title {
            font-size: var(--gptb-font-size-xs);
            font-weight: var(--gptb-font-weight-medium);
            color: var(--gptb-color-text-secondary);
            text-align: center;
        }

        #gpt-burger-root .batch-delete-btn {
            background: rgba(248, 113, 113, 0.9) !important;
            color: #ffffff !important;
            border-color: rgba(248, 113, 113, 0.9) !important;
        }

        #gpt-burger-root .batch-delete-btn:hover {
            background: rgba(239, 68, 68, 0.9) !important;
            color: #ffffff !important;
            border-color: rgba(239, 68, 68, 0.9) !important;
        }
        
        #gpt-burger-root .batch-move-btn,
        #gpt-burger-root .batch-export-btn {
             background: var(--gptb-color-background-button);
             color: var(--gptb-color-text-primary);
        }

        #gpt-burger-root .batch-move-btn:hover,
        #gpt-burger-root .batch-export-btn:hover {
             background: var(--gptb-color-background-button-hover);
             color: var(--gptb-color-text-on-accent);
             border-color: var(--gptb-color-border-hover);
        }
        
        /* ===== 顶栏按钮（新） ===== */
        #gpt-burger-root .topbar {
            padding: 0 var(--gptb-spacing-xs);
            background: transparent !important; /* 顶栏容器透明 */
            box-shadow: none !important;
            border: none !important;
        }
        /* 顶栏主要按钮沿用统一圆角样式（保持原样式） */

        /* 视图切换 pill */
        #gpt-burger-root .view-switch-btn {
            border: none;
            background: transparent;
            padding: 0;
        }
        #gpt-burger-root .view-pill {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 3px 6px;
            height: 28px;
            border-radius: 999px;
            border: 2px solid var(--gptb-color-border-default);
            background: transparent;
        }
        #gpt-burger-root .view-pill[data-state="time"] {
            background: transparent;
        }
        #gpt-burger-root .view-pill[data-state="group"] {
            background: transparent;
        }
        #gpt-burger-root .view-pill-label {
            font-size: 12px;
            color: var(--gptb-color-text-secondary);
            z-index: 1;
            padding: 0 4px;
            transition: color 0.15s ease;
        }
        #gpt-burger-root .view-pill[data-state="time"] .view-pill-label.time { color: var(--gptb-color-text-on-accent); }
        #gpt-burger-root .view-pill[data-state="group"] .view-pill-label.group { color: var(--gptb-color-text-on-accent); }
        #gpt-burger-root .view-pill-thumb {
            position: absolute;
            top: 2px;
            bottom: 2px;
            width: calc(50% - 4px);
            background: var(--gptb-color-background-button-hover);
            border-radius: 999px;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            transform: translateX(2px);
        }
        #gpt-burger-root .view-pill-thumb[data-state="group"] {
            transform: translateX(calc(100% + 2px));
        }
        
        /* ===== 统一的管理模式样式 ===== */
        /* 移除旧的.managing样式，统一使用.manage-mode */
        /* 所有管理模式下的书签都使用相同的动态高度逻辑 */

        /* ===== 批量操作栏 ===== */
        #gpt-burger-root .batch-actions-title {
            font-size: 11px;
            font-weight: 500;
            color: var(--gptb-color-text-secondary);
            text-align: center;
            order: 2;
        }

        #gpt-burger-root .batch-btn {
            background: var(--gptb-color-background-button);
            color: var(--gptb-color-text-primary);
            border: 1px solid var(--gptb-color-border-default);
            border-radius: var(--gptb-radius-lg);
            padding: var(--gptb-spacing-xs) var(--gptb-spacing-md);
            cursor: pointer;
            transition: all 0.2s ease;
            height: var(--gptb-size-button-height);
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: var(--gptb-spacing-xs);
        }

        #gpt-burger-root .batch-btn:hover {
            background: var(--gptb-color-background-button-hover);
            color: var(--gptb-color-text-on-accent);
            border-color: var(--gptb-color-border-hover);
        }

        #gpt-burger-root .batch-delete-btn:hover {
            background: rgba(232, 90, 71, 0.8);
            border-color: rgba(232, 90, 71, 0.8);
        }

        html.dark #gpt-burger-root .sort-btn:hover,
        html.dark #gpt-burger-root .manage-btn:hover {
            background: var(--gptb-color-background-button-hover) !important;
            color: var(--gptb-color-text-on-accent) !important;
            border-color: var(--gptb-color-border-hover) !important;
        }
    `;

    // 当禁用深色模式时，强制在 html.dark 环境下仍使用浅色变量与样式
    if (USER_SETTINGS && USER_SETTINGS.enableDarkMode === false) {
        cssContent += `
        html.dark #gpt-burger-root, html.dark #gpt-burger-root body {
            --gptb-color-text-primary: #1e293b;
            --gptb-color-text-secondary: #64748b;
            --gptb-color-text-on-accent: #ffffff;
            --gptb-color-background-container: rgba(255, 255, 255, 0.95);
            --gptb-color-background-button: rgba(255, 255, 255, 0.8);
            --gptb-color-background-button-save: rgba(255, 255, 255, 0.95);
            --gptb-color-background-button-hover: #334155;
            --gptb-color-background-item-idle: rgba(245, 245, 245, 0.1);
            --gptb-color-background-item-hover: rgba(245, 245, 245, 0.3);
            --gptb-color-background-tooltip: rgba(255, 255, 255, 0.8);
            --gptb-color-border-default: #e2e8f0;
            --gptb-color-border-hover: #334155;
            --gptb-color-border-tooltip: #ccc;
            --gptb-color-border-bookmark-default: transparent;
            --gptb-color-border-bookmark-hover: var(--gptb-color-border-hover);
        }
        
        /* Legacy color overrides */
        html.dark #gpt-burger-root .group-header { 
            background: var(--gptb-color-background-container); 
        }
        html.dark #gpt-burger-root .bookmark-原文-tooltip {
            background: var(--gptb-color-background-tooltip);
            color: var(--gptb-color-text-secondary);
            border-color: var(--gptb-color-border-tooltip);
        }
        `;
    }

    style.textContent = cssContent;
    document.head.appendChild(style);
    
    console.log("🎨 [Debug] createStyles: Design tokens applied. CSS length:", cssContent.length);
}

// 🔵 添加书签到当前对话
function addBookmarkToCurrentChat(bookmark) {
    console.log('📥 开始添加书签到当前对话', {
        currentChatId,
        bookmark
    });

    if (!allBookmarks[currentChatId]) {
        console.log('📁 为当前对话创建新的存储空间');
        allBookmarks[currentChatId] = {
            bookmarks: [],
            groupOrder: ['', ...DEFAULT_COLOR_GROUPS],  // 确保有默认分组和预设颜色分组
            groupMap: {}
        };
    }

    // 确保存在 groupOrder 且包含所有预设颜色
    if (!allBookmarks[currentChatId].groupOrder) {
        allBookmarks[currentChatId].groupOrder = ['', ...DEFAULT_COLOR_GROUPS];
    } else {
        const missingColors = DEFAULT_COLOR_GROUPS.filter(color => !allBookmarks[currentChatId].groupOrder.includes(color));
        if (missingColors.length > 0) {
            const defaultIndex = allBookmarks[currentChatId].groupOrder.indexOf('');
            allBookmarks[currentChatId].groupOrder.splice(defaultIndex + 1, 0, ...missingColors);
        }
    }

    // 确保存在 groupMap
    if (!allBookmarks[currentChatId].groupMap) {
        allBookmarks[currentChatId].groupMap = {};
    }

    const chatData = allBookmarks[currentChatId];
    console.log('📊 当前对话数据：', chatData);

    chatData.bookmarks.push(bookmark);
    console.log('✅ 书签已添加到数组');

    if (bookmark.group) {
        if (!chatData.groupMap[bookmark.group]) {
            chatData.groupMap[bookmark.group] = [];
            // 如果是新分组且不是预设颜色，添加到 groupOrder
            if (!chatData.groupOrder.includes(bookmark.group) && !DEFAULT_COLOR_GROUPS.includes(bookmark.group)) {
                chatData.groupOrder.push(bookmark.group);
            }
            console.log('📁 创建新的分组：', bookmark.group);
        }
        chatData.groupMap[bookmark.group].push(bookmark.id);
        console.log('✅ 书签已添加到分组');
    }

    console.log('💾 准备保存到 localStorage');
    saveBookmarksToStorage();
    console.log('✅ 保存完成');
}

// 创建快速操作弹窗 - 简化版，只支持4个固定颜色分组
function createQuickActionPopup() {
    console.log('🔧 开始创建快速操作弹窗');
    
    // 检查文档中是否已存在弹窗
    const existingPopup = document.getElementById('quick-action-popup');
    if (existingPopup) {
        console.log('🗑️ 移除已存在的弹窗');
        existingPopup.remove();
    }
    
    const popup = document.createElement('div');
    popup.className = 'compact-save-popup';
    popup.id = 'quick-action-popup';
    
    // 根据主题设置样式 - 移除内联样式，使用CSS文件中的样式
    popup.style.cssText = `
        display: none;
        position: fixed;
        z-index: 10000;
    `;
    
    // 创建一个变量来存储选中的表情
    let selectedEmoji = '';
    
    const content = document.createElement('div');
    content.innerHTML = `
        <input type="text" class="compact-bookmark-name" placeholder="${i18n('addTitlePlaceholder')}">
        <div class="compact-popup-actions">
            <div class="compact-quick-groups">
                ${DEFAULT_COLOR_GROUPS.map((color, index) => `
                    <button class="compact-group-btn group-style-${index + 1}" 
                        data-emoji="${color}" 
                        title="${i18n('group')} ${color}"></button>
            `).join('')}
        </div>
            <button class="compact-save-btn">${i18n('save')}</button>
        </div>
    `;
    
    popup.appendChild(content);
    if (gptBurgerRoot) {
        gptBurgerRoot.appendChild(popup);
    } else {
    document.body.appendChild(popup);
    }
    
    const input = popup.querySelector('.compact-bookmark-name');
    const saveButton = popup.querySelector('.compact-save-btn');
    const emojiSpans = popup.querySelectorAll('.compact-group-btn');
    
    // 选择表情 - 简化版本，让CSS处理样式
    emojiSpans.forEach((span, index) => {
        span.onclick = (e) => {
            e.stopPropagation();
            console.log('🎯 点击了颜色按钮：', span.dataset.emoji);
            
            const emoji = span.dataset.emoji;
            const colorId = index + 1;
            
            // 清除所有弹窗背景色类
            popup.classList.remove('group-selected-1', 'group-selected-2', 'group-selected-3', 'group-selected-4');
            
            if (selectedEmoji === emoji) {
                // 取消选择
                span.classList.remove('selected');
                selectedEmoji = '';
                popup.classList.remove('color-transition');
                console.log('取消选择颜色');
            } else {
                // 重置所有按钮
                emojiSpans.forEach(s => s.classList.remove('selected'));
                // 设置选中状态
                span.classList.add('selected');
                selectedEmoji = emoji;
                
                // 通过添加类来更新弹窗背景颜色
                popup.classList.add('color-transition');
                popup.classList.add(`group-selected-${colorId}`);
                
                console.log('选择新颜色：', selectedEmoji, '应用的类：', `group-selected-${colorId}`);
            }
        };
    });
    
    // 保存按钮点击
    saveButton.onclick = (e) => {
        console.log('🔵 点击保存按钮');
        e.stopPropagation();
        
        if (!tempBookmark) {
            console.warn('❌ 没有找到临时书签');
            alert('请重新选择要保存的文本');
            return;
        }
        
        // 关键修复：确保 tempBookmark.group 被正确赋值为颜色编号
        tempBookmark.title = input.value.trim(); // 将输入框内容保存为title
        tempBookmark.group = selectedEmoji; // 正确赋值
        console.log('📝 更新后的书签：', tempBookmark);
        
        try {
            // 确保当前对话的数据结构存在
            const currentChatData = ensureCurrentChatData();
            
            // 保存书签
            addBookmarkToCurrentChat(tempBookmark);
            console.log('✅ 书签保存成功');
            
            // 展开书签边栏以显示新创建的书签
            showBookmarkSidebar();
            
            // 更新显示
            renderBookmarkList();
            console.log('✅ 书签列表已更新');
            
            // 高亮显示新创建的书签
            highlightNewBookmark(tempBookmark.id);
            
            // 重置状态
            popup.style.display = 'none';
            input.value = '';
            selectedEmoji = '';
            tempBookmark = null;
            // 重置弹窗背景
            popup.classList.remove('color-transition', 'group-selected-1', 'group-selected-2', 'group-selected-3', 'group-selected-4');
            emojiSpans.forEach(s => s.classList.remove('selected'));
            console.log('✅ 所有状态已重置');
        } catch (error) {
            console.error('❌ 保存书签时出错：', error);
            alert('保存书签时出错，请重试');
        }
    };
    
    // 回车保存
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            console.log('⌨️ 按下回车键');
            e.preventDefault();
            saveButton.click();
        }
        // ESC键关闭弹窗
        if (e.key === 'Escape') {
            console.log('⌨️ 按下ESC键，关闭弹窗');
            popup.style.display = 'none';
            // 重置状态
            input.value = '';
            selectedEmoji = '';
            tempBookmark = null;
            popup.style.backgroundColor = '';
            popup.classList.remove('color-transition');
            emojiSpans.forEach(s => s.classList.remove('selected'));
        }
    };
    
    // 添加失焦消失功能
    input.onblur = (e) => {
        // 使用setTimeout延迟检查，避免点击按钮时立即关闭
            setTimeout(() => {
            // 检查焦点是否还在弹窗内
            const activeElement = document.activeElement;
            if (!popup.contains(activeElement)) {
                console.log('📤 弹窗失焦，自动关闭');
            closeQuickActionPopup();
        }
        }, 150);
    };
    
    // 阻止冒泡
    popup.onmousedown = (e) => e.stopPropagation();
    
    return popup;
}

// 新建一个关闭弹窗并重置其状态的函数
function closeQuickActionPopup() {
    const popup = document.getElementById('quick-action-popup');
    if (popup && popup.style.display !== 'none') {
            popup.style.display = 'none';
        
        // 重置所有状态
        const input = popup.querySelector('.compact-bookmark-name');
        if (input) input.value = '';
        
        const emojiSpans = popup.querySelectorAll('.compact-group-btn');
        emojiSpans.forEach(s => s.classList.remove('selected'));
        
        popup.classList.remove('color-transition', 'group-selected-1', 'group-selected-2', 'group-selected-3', 'group-selected-4');
        
        // 全局状态
            tempBookmark = null;
    
        console.log('✅ 弹窗已关闭并重置');
    }
}

// 选中文本显示弹窗
document.addEventListener('mouseup', (e) => {
    // 检查点击是否在书签栏内部
    const gptBurgerRoot = document.getElementById('gpt-burger-root');
    if (gptBurgerRoot && gptBurgerRoot.contains(e.target)) {
        return;
    }

    // 如果在管理模式下，不显示弹窗
    if (isManageMode) {
        return;
    }

    // 检查是否点击在现有弹窗内，如果是则不处理
    const existingPopup = document.getElementById('quick-action-popup');
    if (existingPopup && existingPopup.contains(e.target)) {
        console.log('🎯 点击在弹窗内，跳过处理');
        return;
    }

    // 延迟一小段时间以确保浏览器完成文本选择状态的更新
    setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText && selectedText.length >= 1) {
            // 如果有新的文本被选中，则显示或更新弹窗
            handleTextSelection(selection, selectedText, e);
        } else {
            // 如果没有文本被选中（这是一次普通的点击），则关闭弹窗
            if (existingPopup) {
                closeQuickActionPopup();
            }
        }
    }, 10); // 10毫秒的延迟通常足够
});

// 新建一个专门处理文本选择的函数，使逻辑更清晰
function handleTextSelection(selection, selectedText, event) {
    console.log('📝 处理新的文本选择：', selectedText);

        let node = selection.anchorNode;
        while (node && node.nodeType === 3) {
            node = node.parentNode;
        }
        
        const article = node.closest('article');
    if (!article) {
        console.warn('⚠️ 选中的文本不在一个有效的article块内');
        return;
    }

            console.log('✅ 找到文本所在的文章块');
            
    // ... [这里是原来创建tempBookmark的逻辑] ...
            // 获取上下文（只在选中节点内）
            let contextBefore = '';
            let contextAfter = '';
            if (selectedText.length < 15) {
                const textNode = selection.anchorNode;
                const startOffset = Math.min(selection.anchorOffset, selection.focusOffset);
                const endOffset = Math.max(selection.anchorOffset, selection.focusOffset);
                contextBefore = textNode.textContent.slice(Math.max(0, startOffset - 20), startOffset);
                contextAfter = textNode.textContent.slice(endOffset, endOffset + 20);
            }
            
            tempBookmark = {
                id: `bookmark-${Date.now()}`,
                title: '', // 新增标题字段
                summary: selectedText,
                text: selectedText,
                articleId: article.dataset.testid,
                offset: article.offsetTop,
                contextBefore,
                contextAfter,
                group: '',
                containerInfo: analyzeSelectionContainer(selection, article, selectedText)
            };

    console.log('📝 创建临时书签:', tempBookmark);

    // 显示或更新弹窗
    showQuickActionPopup(event);
}

// 新建一个专门显示弹窗的函数
function showQuickActionPopup(event) {
    let popup = document.getElementById('quick-action-popup');
            if (!popup) {
                popup = createQuickActionPopup();
    }

    const input = popup.querySelector('.compact-bookmark-name');
                if (input) {
                    input.value = ''; // 确保输入框为空
                    
        // 重置UI状态
        popup.style.backgroundColor = '';
        popup.classList.remove('color-transition');
        const colorButtons = popup.querySelectorAll('.compact-group-btn');
        colorButtons.forEach(s => s.classList.remove('selected'));

        // 定位并显示
        popup.style.left = `${event.clientX + 5}px`;
        popup.style.top = `${event.clientY + 5}px`;
                    popup.style.display = 'block';
    }
}

// 确保在页面加载完成后初始化插件
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlugin);
  } else {
    initPlugin();
  }

let lastChatId = currentChatId;

// 每 1 秒检查 URL 是否变动
setInterval(() => {
    const newChatId = getCurrentChatId();
    if (newChatId !== lastChatId) {
      lastChatId = newChatId;
      currentChatId = newChatId;
  
      waitForArticlesAndRender(); // ✅ 等 article 加载完再插入锚点
  
      console.log("📄 检测到对话切换，等待页面加载后刷新书签！");
    }
}, 1000);

// 更新快速操作弹窗的分组列表
function updateQuickActionPopupGroups() {
    console.log('🔄 更新快速操作弹窗的分组列表');
    const popup = document.getElementById('quick-action-popup');
    if (!popup) {
        console.log('⚠️ 未找到快速操作弹窗');
        return;
    }

    const groupsContainer = popup.querySelector('.quick-action-groups');
    if (!groupsContainer) {
        console.log('⚠️ 未找到分组容器');
        return;
    }

    // 保存新建分组按钮
    const newGroupBtn = groupsContainer.querySelector('.new-group-btn');
    
    // 清空现有分组（除了新建分组按钮）
    groupsContainer.innerHTML = '';
    
    // 重新添加预设颜色分组
    DEFAULT_COLOR_GROUPS.forEach(color => {
        const span = document.createElement('span');
        span.className = 'group-emoji';
        span.dataset.emoji = color;
        span.textContent = color;
        span.style.cssText = `
            cursor: pointer;
            padding: 2px 4px;
        `;
        
        // 添加点击事件
        span.onclick = (e) => {
            e.stopPropagation();
            const emojiSpans = groupsContainer.querySelectorAll('.group-emoji');
            if (selectedEmoji === color) {
                span.style.background = 'none';
                selectedEmoji = '';
            } else {
                emojiSpans.forEach(s => s.style.background = 'none');
                span.style.background = isDarkMode ? '#343541' : '#e3f2fd';
                span.style.borderRadius = '6px';
                selectedEmoji = color;
            }
        };
        
        groupsContainer.appendChild(span);
    });
    
    // 添加自定义分组
    if (allBookmarks[currentChatId] && allBookmarks[currentChatId].groupOrder) {
        allBookmarks[currentChatId].groupOrder.forEach(groupName => {
            if (groupName && !DEFAULT_COLOR_GROUPS.includes(groupName)) {
                const span = document.createElement('span');
                span.className = 'group-emoji';
                span.dataset.emoji = groupName;
                span.textContent = groupName;
                span.style.cssText = `
                    cursor: pointer;
                    padding: 2px 4px;
                `;
                
                // 添加点击事件
                span.onclick = (e) => {
                    e.stopPropagation();
                    const emojiSpans = groupsContainer.querySelectorAll('.group-emoji');
                    if (selectedEmoji === groupName) {
                        span.style.background = 'none';
                        selectedEmoji = '';
                    } else {
                        emojiSpans.forEach(s => s.style.background = 'none');
                        span.style.background = isDarkMode ? '#343541' : '#e3f2fd';
                        span.style.borderRadius = '6px';
                        selectedEmoji = groupName;
                    }
                };
                
                groupsContainer.appendChild(span);
            }
        });
    }
    
    // 重新添加新建分组按钮
    if (newGroupBtn) {
        groupsContainer.appendChild(newGroupBtn);
    } else {
        // 如果没有找到原来的按钮，创建一个新的
        const newBtn = document.createElement('button');
        newBtn.className = 'new-group-btn';
                        newBtn.textContent = i18n('addNewGroup');
        newBtn.style.cssText = `
            cursor: pointer;
            padding: 2px 4px;
            background: none;
            border: 1px dashed ${isDarkMode ? '#4a4b4d' : '#ccc'};
            border-radius: 4px;
            color: ${isDarkMode ? '#fff' : '#000'};
        `;
        groupsContainer.appendChild(newBtn);
    }
    
    console.log('✅ 快速操作弹窗分组列表已更新');
}

// 获取国际化文本的辅助函数
// 全局语言覆盖支持
async function setLanguageOverride(lang) {
    try {
        GPTB_LANG_OVERRIDE = lang && lang !== 'system' ? lang : null;
        GPTB_I18N_CACHE = null;
        if (GPTB_LANG_OVERRIDE) {
            // 通过 web_accessible_resources 读取对应语言包
            const url = chrome.runtime.getURL(`_locales/${GPTB_LANG_OVERRIDE}/messages.json`);
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
            const json = await res.json();
            GPTB_I18N_CACHE = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v && v.message ? v.message : '']));
        }
        // 不重建 UI，直接更新文案，避免闪烁
        applyLanguageToUI();
    } catch (e) {
        console.warn('setLanguageOverride failed', e);
        GPTB_LANG_OVERRIDE = null;
        GPTB_I18N_CACHE = null;
    }
}

function i18n(key, substitutions = []) {
    // 1) 优先使用覆盖语言缓存
    if (GPTB_I18N_CACHE && GPTB_I18N_CACHE[key]) {
        return GPTB_I18N_CACHE[key];
    }
    // 2) 默认走系统语言
    return chrome.i18n.getMessage(key, substitutions) || key;
}

// 获取当前有效 UI 语言（覆盖优先）
function getEffectiveUILang() {
    if (GPTB_LANG_OVERRIDE) return GPTB_LANG_OVERRIDE;
    try {
        return chrome.i18n.getUILanguage() || 'en';
    } catch {
        return 'en';
    }
}

function getLangBang() {
    return getEffectiveUILang().startsWith('zh') ? '！' : '!';
}

// 仅更新界面上的语言，不重建 DOM
function applyLanguageToUI() {
    try {
        // 顶栏按钮
        updateUIText();
        if (typeof updateAllButtonsText === 'function') updateAllButtonsText();

        const sortBtn = document.querySelector('.sort-btn');
        if (sortBtn) {
            sortBtn.title = i18n('viewSwitch');
            sortBtn.textContent = isSortByGroup ? i18n('sortByGroup') : i18n('sortByTime');
        }

        const bakeBtn = document.querySelector('.bake-btn');
        if (bakeBtn) {
            bakeBtn.textContent = `${i18n('bake')}${getLangBang()}`;
            bakeBtn.style.fontStyle = 'italic';
        }
        const copyBtn = document.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.textContent = i18n('copy');
            copyBtn.style.fontStyle = '';
        }
        // 顶栏语言按钮已移除，使用 dock 按钮

        // 若 Bake 弹窗打开，更新其文案与占位
        const modal = document.querySelector('.export-modal');
        if (modal) {
            const titleEl = modal.querySelector('.export-modal-title');
            if (titleEl) titleEl.textContent = i18n('bake');
            const cancelEl = modal.querySelector('.export-cancel-btn[data-action="cancel"]');
            if (cancelEl) cancelEl.textContent = i18n('cancel');
            const confirmEl = modal.querySelector('.export-confirm-btn[data-action="bake"]');
            if (confirmEl) confirmEl.textContent = i18n('bake');
            const headInput = modal.querySelector('.export-head-input');
            if (headInput) headInput.placeholder = i18n('promptHeadPlaceholder');
            const tailInput = modal.querySelector('.export-tail-input');
            if (tailInput) tailInput.placeholder = i18n('promptTailPlaceholder');
            const descEl = modal.querySelector('.export-modal-desc');
            if (descEl) descEl.textContent = i18n('bakeIntro');
            modal.querySelectorAll('.preset-chip').forEach(chip => {
                const key = chip.getAttribute('data-key');
                if (key === 'structured') chip.textContent = i18n('presetStructured');
                else if (key === 'creative') chip.textContent = i18n('presetCreative');
            });
        }
    } catch (e) {
        console.warn('applyLanguageToUI failed', e);
    }
}

// 更新UI文本
function updateUIText() {
    const manageBtn = document.querySelector('.manage-btn');
    if (manageBtn) {
        manageBtn.textContent = isManageMode ? i18n('doneMode') : i18n('selectMode');
    }

    // 更新其他UI文本
    const elements = {
        '.new-group-btn': 'newGroup',
        '.default-group': 'defaultGroup',
        '.delete-btn': 'delete',
        '.move-btn': 'move',
        '.export-title': 'exportToGPT',
        '.custom-prompt-title': 'customPrompt',
        '.confirm-export-btn': 'confirmExport',
        '.copy-btn': 'copy',
        '.bake-btn': 'bake'
    };

    for (const [selector, messageKey] of Object.entries(elements)) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = i18n(messageKey);
        }
    }
}

// 在初始化和UI更新时调用
function initializeUI() {
    if (!document.getElementById('gpt-burger-root')) {
        gptBurgerRoot = document.createElement('div');
        gptBurgerRoot.id = 'gpt-burger-root';
        document.body.appendChild(gptBurgerRoot);
        console.log('🍔 GPT Burger Root created.');
    }

    createStyles();
    createBookmarkUI();
    createQuickActionPopup();

    // ... existing initialization code ...
    updateUIText();
}

// 更新导出模板中的文本
const exportTemplates = {
    raw: {
        title: '原始格式',
        tooltip: '直接导出书签内容，保持原始格式',
        prompt: content => '以下是书签内容：\n\n' + content,
        needCustomPrompt: false
    },
    quotes: {
        title: '引用格式',
        tooltip: '将书签内容格式化为引用形式，适合学术用途',
        prompt: content => '请分析以下引用内容：\n\n' + content + '\n\n请对这些内容进行总结和分析。',
        needCustomPrompt: false
    },
    structured: {
        title: '结构化格式',
        tooltip: '将书签内容组织成结构化的列表，便于GPT理解和处理',
        prompt: content => '请帮我整理以下内容：\n\n' + content + '\n\n请将这些内容整理成结构化的列表或大纲。',
        needCustomPrompt: false
    },
    creative: {
        title: '创意格式',
        tooltip: '将书签内容用于创意写作或头脑风暴',
        prompt: content => '基于以下内容进行创意发挥：\n\n' + content + '\n\n请基于这些内容进行创意写作或头脑风暴。',
        needCustomPrompt: false
    },
    custom: {
        title: '自定义格式',
        tooltip: '使用自定义提示词处理书签内容',
        prompt: (content, customPrompt) => customPrompt + '\n\n' + content,
        needCustomPrompt: true
    }
};

// 更新提示和错误消息
function showMessage(key, substitutions = {}) {
    alert(i18n(key, substitutions));
}

// 在显示选中项数量时使用i18n
function updateSelectedCount(count) {
    const selectedCountSpan = document.querySelector('#selected-count');
    if (selectedCountSpan) {
        selectedCountSpan.textContent = count.toString();
    }
    
    // 更新批量操作按钮的可见性
    updateBatchActionButtons();
}

// 更新批量操作按钮的可见性和状态
function updateBatchActionButtons() {
    const batchActionsContainer = document.querySelector('.batch-actions-container');
    if (!batchActionsContainer) return;
    
    const selectedCount = selectedBookmarks.size;
    
    if (selectedCount > 0) {
        // 有选中书签时显示容器
        batchActionsContainer.classList.add('has-selected');
        batchActionsContainer.style.opacity = '1';
        batchActionsContainer.style.pointerEvents = 'auto';
    } else {
        // 没有选中书签时隐藏容器
        batchActionsContainer.classList.remove('has-selected');
        batchActionsContainer.style.opacity = '1'; // 保持不透明，因为容器会隐藏
        batchActionsContainer.style.pointerEvents = 'none';
    }
}

// 在确认删除时使用i18n
function confirmDelete(count) {
    return confirm(i18n('deleteConfirm', [count.toString()]));
}

// 在复制成功/失败时使用i18n
function handleCopyResult(success) {
    showMessage(success ? 'copySuccess' : 'copyFailed');
}

// ... existing code ...
// 更新错误处理
function handleError(key, err) {
    console.error(`❌ ${i18n(key)}:`, err);
    showMessage(key);
}

// 更新日志
function log(key, ...args) {
    console.log(`✅ ${i18n(key)}`, ...args);
}

// 更新警告
function warn(key, ...args) {
    console.warn(`⚠️ ${i18n(key)}`, ...args);
}

// 更新分组标题
function getGroupTitle(groupName) {
    return groupName || i18n('defaultGroup');
}

// 更新新建分组按钮
const newGroupBtn = document.createElement('button');
newGroupBtn.className = 'new-group-btn';
newGroupBtn.textContent = i18n('newGroup');

// 更新分组输入框
const groupInput = document.createElement('input');
groupInput.type = 'text';
groupInput.placeholder = i18n('enterGroupName');

// 更新取消按钮
const cancelBtn = document.createElement('button');
cancelBtn.className = 'cancel-btn';
cancelBtn.textContent = i18n('cancel');

// 更新确认按钮
const confirmBtn = document.createElement('button');
confirmBtn.className = 'confirm-btn';
confirmBtn.textContent = i18n('confirm');

// ... existing code ...

// 更新按钮文本
function updateButtonText(button, messageKey) {
    if (button) {
        button.textContent = chrome.i18n.getMessage(messageKey);
    }
}

// 更新所有按钮文本
function updateAllButtonsText() {
    // 主要按钮
    updateButtonText(document.querySelector('.organize-export-btn'), 'organizeAndExport');
    updateButtonText(document.querySelector('.save-btn'), 'save');
    updateButtonText(document.querySelector('.add-group-btn'), 'addGroup');
    
    // 批量操作按钮
    updateButtonText(document.querySelector('.batch-delete-btn'), 'batchDelete');
    updateButtonText(document.querySelector('.batch-move-btn'), 'batchMove');
    updateButtonText(document.querySelector('.select-all-btn'), 'selectAll');
    updateButtonText(document.querySelector('.unselect-all-btn'), 'unselectAll');
    
    // 分组操作按钮
    updateButtonText(document.querySelector('.delete-group-btn'), 'deleteGroup');
    updateButtonText(document.querySelector('.edit-group-btn'), 'editGroup');
    updateButtonText(document.querySelector('.collapse-group-btn'), 'collapseGroup');
    updateButtonText(document.querySelector('.expand-group-btn'), 'expandGroup');
}

// 在初始化和UI更新时调用
function initializeUI() {
    // ... existing initialization code ...
    updateAllButtonsText();
}

// 更新确认对话框文本
function showDeleteConfirm(type) {
    const messageKey = type === 'group' ? 'deleteGroupConfirm' : 'deleteBookmarkConfirm';
    return confirm(chrome.i18n.getMessage(messageKey));
}

// 更新按钮创建
function createButton(className, messageKey, clickHandler) {
    const button = document.createElement('button');
    button.className = className;
    button.textContent = chrome.i18n.getMessage(messageKey);
    if (clickHandler) {
        button.addEventListener('click', clickHandler);
    }
    return button;
}

// 切换管理模式
function handleOrganizeExport() {
    isManageMode = !isManageMode;
    console.log("🔳 管理模式切换:", isManageMode);

    const displayMode = isManageMode ? 'inline-block' : 'none';
    const oppositeDisplayMode = isManageMode ? 'none' : 'inline-block';

    // 批量操作按钮
    const selectAllBtn = document.querySelector('.select-all-btn');
    const batchDeleteBtn = document.querySelector('.batch-delete-btn');
    const batchMoveBtn = document.querySelector('.batch-move-btn');
    
    if(selectAllBtn) selectAllBtn.style.display = displayMode;
    if(batchDeleteBtn) batchDeleteBtn.style.display = displayMode;
    if(batchMoveBtn) batchMoveBtn.style.display = displayMode;
    
    // 常规按钮
    const saveBtn = document.querySelector('.save-btn');
    const newGroupBtn = document.querySelector('.new-group-btn');

    if(saveBtn) saveBtn.style.display = oppositeDisplayMode;
    if(newGroupBtn) newGroupBtn.style.display = oppositeDisplayMode;

    renderBookmarkList(); // 重新渲染以显示/隐藏复选框
}

function handleSave() {
    console.log('handleSave called');
    // 未来实现保存逻辑
}

function handleAddGroup() {
    console.log('handleAddGroup called');
    // 未来实现添加分组逻辑
}

// 在创建UI元素时使用国际化文本
function createBookmarkControls() {
    const controls = document.createElement('div');
    controls.className = 'bookmark-controls';
    
    // 常规按钮
    const organizeExportBtn = createButton('organize-export-btn', 'organizeAndExport', handleOrganizeExport);
    const saveBtn = createButton('save-btn', 'save', handleSave);
    const addGroupBtn = createButton('add-group-btn', 'addGroup', handleAddGroup);
    
    // 批量操作按钮（默认隐藏）
    const selectAllBtn = createButton('select-all-btn', 'selectAll');
    const batchDeleteBtn = createButton('batch-delete-btn', 'batchDelete');
    const batchMoveBtn = createButton('batch-move-btn', 'batchMove');
    
    selectAllBtn.style.display = 'none';
    batchDeleteBtn.style.display = 'none';
    batchMoveBtn.style.display = 'none';

    controls.appendChild(organizeExportBtn);
    controls.appendChild(saveBtn);
    controls.appendChild(addGroupBtn);
    controls.appendChild(selectAllBtn);
    controls.appendChild(batchDeleteBtn);
    controls.appendChild(batchMoveBtn);

    return controls;
}

// ... existing code ...

// ... existing code ...
/*
// 更新主UI生成代码
function generateMainUI() {
    const container = document.createElement('div');
    container.className = 'bookmark-container';
    
    // 顶部控制栏
    const controls = createBookmarkControls();
    container.appendChild(controls);
    
    // 分组列表
    const groupList = document.createElement('div');
    groupList.className = 'group-list';
    container.appendChild(groupList);
    
    return container;
}
*/

/*
// 更新分组UI生成代码
function generateGroupUI(groupName, bookmarks) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'group-container';
    
    // 分组标题
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    groupHeader.innerHTML = `
        <span class="group-title">${groupName || chrome.i18n.getMessage('defaultGroupName')}</span>
        <div class="group-actions">
            ${createButton('edit-group-btn', 'editGroup').outerHTML}
            ${createButton('delete-group-btn', 'deleteGroup').outerHTML}
            ${createButton('collapse-group-btn', 'collapseGroup').outerHTML}
        </div>
    `;
    
    groupContainer.appendChild(groupHeader);
    
    // 书签列表
    const bookmarkList = document.createElement('div');
    bookmarkList.className = 'bookmark-list';
    if (bookmarks.length === 0) {
        bookmarkList.innerHTML = `<div class="empty-message">${chrome.i18n.getMessage('noBookmarks')}</div>`;
    } else {
        bookmarks.forEach(bookmark => {
            bookmarkList.appendChild(generateBookmarkUI(bookmark));
        });
    }
    
    groupContainer.appendChild(bookmarkList);
    return groupContainer;
}
*/

/*
// 更新批量操作UI - 此函数已废弃，逻辑已合并到 createBookmarkControls
function generateBatchOperationsUI() {
    const container = document.createElement('div');
    container.className = 'batch-operations';
    
    container.appendChild(createButton('select-all-btn', 'selectAll'));
    container.appendChild(createButton('batch-delete-btn', 'batchDelete'));
    container.appendChild(createButton('batch-move-btn', 'batchMove'));
    
    return container;
}
*/

// 更新确认对话框调用
function confirmDelete(type, count) {
    const messageKey = type === 'group' ? 'deleteGroupConfirm' : 'deleteBookmarkConfirm';
    return confirm(chrome.i18n.getMessage(messageKey));
}

// ... existing code ...

/*
// 修改生成主UI的函数
function generateBookmarkUI() {
    const container = document.createElement('div');
    container.className = 'gptburger-container';
    
    // 创建顶部按钮组
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';
    
    // 使用国际化文本创建按钮
    const organizeBtn = document.createElement('button');
    organizeBtn.className = 'organize-export-btn';
    organizeBtn.textContent = i18n('organizeAndExport');
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.textContent = i18n('save');
    
    const newGroupBtn = document.createElement('button');
    newGroupBtn.className = 'new-group-btn';
    newGroupBtn.textContent = i18n('addGroup');
    
    buttonContainer.appendChild(organizeBtn);
    buttonContainer.appendChild(saveBtn);
    buttonContainer.appendChild(newGroupBtn);
    
    container.appendChild(buttonContainer);
    
    // 添加分组列表容器
    const groupListContainer = document.createElement('div');
    groupListContainer.className = 'group-list-container';
    container.appendChild(groupListContainer);
    
    return container;
}
*/

// 修改创建分组UI的函数
function createGroupElement(groupName) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'group-item';
    
    const groupNameSpan = document.createElement('span');
    groupNameSpan.textContent = groupName || i18n('defaultGroupName');
    
    const groupActions = document.createElement('div');
    groupActions.className = 'group-actions';
    
    // 创建分组操作按钮
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-group-btn';
    editBtn.textContent = i18n('editGroup');
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-group-btn';
    deleteBtn.textContent = i18n('deleteGroup');
    
    groupActions.appendChild(editBtn);
    groupActions.appendChild(deleteBtn);
    
    groupDiv.appendChild(groupNameSpan);
    groupDiv.appendChild(groupActions);
    
    return groupDiv;
}

// 修改确认对话框
function showConfirmDialog(type) {
    const message = type === 'delete' ? i18n('deleteBookmarkConfirm') : i18n('deleteGroupConfirm');
    return confirm(message);
}

// ... 其他现有代码 ...

// 添加调试函数
function debugI18n() {
    console.log('Current language:', chrome.i18n.getUILanguage());
    console.log('Test i18n messages:');
    [
        'organizeAndExport',
        'save',
        'addGroup',
        'defaultGroupName',
        'editGroup',
        'deleteGroup'
    ].forEach(key => {
        console.log(`${key}:`, chrome.i18n.getMessage(key));
    });
}

// 在初始化时调用调试函数
document.addEventListener('DOMContentLoaded', () => {
    debugI18n();
    updateMainButtons();
});

// 重复定义移除（上方已定义 i18n）

// ... 其他现有代码 ...

// 高亮显示新创建的书签
function highlightNewBookmark(bookmarkId) {
    setTimeout(() => {
        const bookmarkElement = document.querySelector(`[data-id="${bookmarkId}"]`);
        if (bookmarkElement) {
            // 检测当前主题
            const isDarkMode = document.documentElement.classList.contains('dark');
            const highlightColor = isDarkMode ? '#2c3e50' : '#e3f2fd';
            
            // 添加高亮效果
            bookmarkElement.style.transition = 'background-color 0.3s ease';
            bookmarkElement.style.backgroundColor = highlightColor;
            
            // 滚动到书签位置
            const bookmarkList = document.getElementById('gpt-bookmark-list');
            if (bookmarkList) {
                const bookmarkContent = bookmarkList.querySelector('.bookmark-content');
                if (bookmarkContent) {
                    // 计算书签在容器中的位置
                    const containerRect = bookmarkContent.getBoundingClientRect();
                    const elementRect = bookmarkElement.getBoundingClientRect();
                    const scrollTop = bookmarkContent.scrollTop;
                    const targetScrollTop = scrollTop + (elementRect.top - containerRect.top) - containerRect.height / 2;
                    
                    bookmarkContent.scrollTo({
                        top: Math.max(0, targetScrollTop),
                        behavior: 'smooth'
                    });
                }
            }
            
            // 2秒后移除高亮
            setTimeout(() => {
                bookmarkElement.style.backgroundColor = '';
                setTimeout(() => {
                    bookmarkElement.style.transition = '';
                }, 300);
            }, 2000);
            
            console.log('✨ 高亮显示新书签:', bookmarkId);
        }
    }, 200); // 给渲染更多时间
}

// 展开书签边栏
function showBookmarkSidebar() {
    const toggleBtn = document.getElementById('gpt-bookmark-toggle');
    const list = document.getElementById('gpt-bookmark-list');
    
    if (toggleBtn && list) {
        if (list.classList.contains('collapsed')) {
            list.classList.remove('collapsed');
            
            toggleBtn.title = "收起书签";
            console.log("�� 自动展开书签列表（创建书签）");
        }
        
        // 设置保持展开状态，3秒后自动检查是否需要收起
        list.setAttribute('data-keep-open', 'true');
        console.log("🔒 设置保持展开状态，3秒后自动检查");
        
        setTimeout(() => {
            console.log("⏰ 3秒后检查是否需要收起书签栏");
            list.removeAttribute('data-keep-open');
            
            // 检查是否仍在悬停状态
            setTimeout(() => {
                if (!isHoveringButton && !isHoveringList && !list.classList.contains('collapsed')) {
                    list.classList.add('collapsed');
                    
                    toggleBtn.title = "展开书签";
                    console.log("📂 自动收起书签列表（3秒后）");
                }
            }, 100);
        }, 3000);
        
        return true;
    }
    return false;
}

// 🆕 分析选中内容的容器信息
function analyzeSelectionContainer(selection, article, selectedText) {
    console.log('🔍 [定位分析] 开始分析选中内容的容器信息');
    
    if (!selection || selection.rangeCount === 0) {
        console.warn('❌ [定位分析] 没有有效的选择范围');
        return null;
    }
    
    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    console.log('📍 [定位分析] 选择范围信息:', {
        startContainer: startContainer.nodeName,
        endContainer: endContainer.nodeName,
        startOffset: range.startOffset,
        endOffset: range.endOffset
    });
    
    // 检测容器类型
    const containerType = detectContainerType(range);
    console.log('🏷️ [定位分析] 检测到容器类型:', containerType);
    
    // 获取直接容器元素
    const directContainer = findDirectContainer(range);
    console.log('📦 [定位分析] 直接容器:', directContainer ? {
        tagName: directContainer.tagName,
        className: directContainer.className,
        offsetTop: directContainer.offsetTop
    } : '未找到');
    
    // 计算相对于article的偏移
    const relativeOffset = directContainer ? 
        directContainer.offsetTop - article.offsetTop : 0;
    
    const containerInfo = {
        type: containerType,
        container: directContainer ? {
            tagName: directContainer.tagName,
            className: directContainer.className,
            offsetTop: directContainer.offsetTop,
            relativeToArticle: relativeOffset,
            // 🆕 保存用户实际选中的文本，而不是容器的全部文本
            selectedText: selectedText.substring(0, 100).trim(), // 用户实际选中的文本
            containerText: directContainer.textContent ? directContainer.textContent.substring(0, 100).trim() : '', // 容器的文本（备用）
            innerHTML: directContainer.innerHTML ? directContainer.innerHTML.substring(0, 200) : '', // 前200个字符的HTML
            attributes: {
                id: directContainer.id || null,
                role: directContainer.getAttribute('role') || null,
                'data-testid': directContainer.getAttribute('data-testid') || null
            },
            // 🆕 表格单元格专用信息
            tableInfo: getTableCellInfo(directContainer),
            // 🆕 添加更多辅助信息
            outerHTML: directContainer.outerHTML ? directContainer.outerHTML.substring(0, 300) : '', // 外层HTML用于更精确的匹配
            textLength: directContainer.textContent ? directContainer.textContent.length : 0, // 文本总长度
            childElementCount: directContainer.childElementCount || 0 // 子元素数量
        } : null,
        // 兜底：保存原有的简单偏移
        fallbackOffset: article.offsetTop,
        timestamp: Date.now()
    };
    
    console.log('✅ [定位分析] 分析完成:', containerInfo);
    return containerInfo;
}

// 🆕 检测容器类型
function detectContainerType(range) {
    let element = range.commonAncestorContainer;
    
    // 如果是文本节点，获取其父元素
    if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
    }
    
    console.log('🔍 [容器检测] 开始从元素检测:', element.tagName);
    
    // 向上查找最近的有意义容器
    let currentElement = element;
    while (currentElement && !currentElement.matches('article')) {
        const tagName = currentElement.tagName.toLowerCase();
        const className = currentElement.className || '';
        
        console.log(`🔍 [容器检测] 检查元素: ${tagName}.${className}`);
        
        // 代码块检测
        if (tagName === 'pre' || tagName === 'code' || 
            className.includes('code') || className.includes('highlight')) {
            console.log('💻 [容器检测] 识别为代码块');
            return 'code';
        }
        
        // 表格检测
        if (tagName === 'table' || tagName === 'td' || tagName === 'th' || tagName === 'tr') {
            console.log('📊 [容器检测] 识别为表格');
            return 'table';
        }
        
        // 标题检测
        if (tagName.match(/^h[1-6]$/)) {
            console.log('📝 [容器检测] 识别为标题');
            return 'heading';
        }
        
        // 引用块检测
        if (tagName === 'blockquote') {
            console.log('💬 [容器检测] 识别为引用块');
            return 'quote';
        }
        
        currentElement = currentElement.parentElement;
    }
    
    console.log('📄 [容器检测] 识别为普通文本');
    return 'text';
}

// 🆕 查找直接容器元素
function findDirectContainer(range) {
    let element = range.commonAncestorContainer;
    
    if (element.nodeType === 3) {
        element = element.parentElement;
    }
    
    while (element && element.tagName !== 'ARTICLE') {
        const tagName = element.tagName.toLowerCase();
        const className = element.className || '';
        
        if ((tagName === 'pre' || tagName === 'blockquote' ||
            tagName.match(/^h[1-6]$/)) ||
            (tagName === 'div' && (className.includes('code') || className.includes('table'))) ||
            (tagName === 'p' && element.textContent.trim().length > 0)) {
            
            return element;
        }
        
        if (tagName === 'table') {
            return element;
        }
        
        element = element.parentElement;
    }
    
    return null;
}

// 🆕 获取表格单元格的位置信息
function getTableCellInfo(element) {
    if (!element) return null;
    
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'td' || tagName === 'th') {
        const row = element.parentElement;
        const table = row.parentElement;
        
        if (table && table.tagName.toLowerCase() === 'table') {
            const rows = Array.from(table.querySelectorAll('tr'));
            const rowIndex = rows.indexOf(row);
            const cells = Array.from(row.querySelectorAll('td, th'));
            const cellIndex = cells.indexOf(element);
            
            return {
                tableId: table.id || null,
                rowIndex: rowIndex,
                cellIndex: cellIndex,
                isHeader: tagName === 'th',
                textContent: element.textContent.trim()
            };
        }
    }
    
    return null;
}

// 🆕 按时间排序渲染（全新逻辑）
function renderByTimeMode(currentChatData, container) {
    console.log('⏰ 使用时间排序模式渲染');
    
    const bookmarksContainer = document.createElement('div');
    bookmarksContainer.className = 'bookmarks-container time-sorted';
    
    if (currentChatData.bookmarks.length === 0) {
        bookmarksContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无书签</div>';
    } else {
        currentChatData.bookmarks.forEach((bookmark, index) => {
            const bookmarkElement = createTimeBookmarkElement(bookmark, index);
            bookmarksContainer.appendChild(bookmarkElement);
        });
    }
    
    const scrollRoot = (document.querySelector('#gpt-bookmark-list .bookmarks-scroll') || container);
    scrollRoot.appendChild(bookmarksContainer);
}