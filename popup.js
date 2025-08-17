// 获取当前版本号
document.addEventListener('DOMContentLoaded', () => {
    // 从manifest.json中获取版本号
    chrome.runtime.getManifest().version;
    document.querySelector('.version').textContent = `v${chrome.runtime.getManifest().version}`;

    // 添加链接点击事件
    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            // 在新标签页中打开链接
            chrome.tabs.create({ url: link.href });
            e.preventDefault();
        });
    });

    // 设置所有i18n文本
    document.getElementById('introText').textContent = chrome.i18n.getMessage('introText');
    document.getElementById('userGuide').textContent = chrome.i18n.getMessage('userGuide');
    document.getElementById('createBookmark').textContent = chrome.i18n.getMessage('createBookmark');
    document.getElementById('clickToJump').textContent = chrome.i18n.getMessage('clickToJump');
    document.getElementById('doubleClickToEdit').textContent = chrome.i18n.getMessage('doubleClickToEdit');
    document.getElementById('dragToSort').textContent = chrome.i18n.getMessage('dragToSort');
    document.getElementById('exportContent').textContent = chrome.i18n.getMessage('exportContent');
    document.getElementById('contactAuthor').textContent = chrome.i18n.getMessage('contactAuthor');
    document.getElementById('feedback').textContent = chrome.i18n.getMessage('feedbackLink') || chrome.i18n.getMessage('feedback');
    document.getElementById('donateLink').textContent = chrome.i18n.getMessage('donateLink');
    // 悬停展示二维码，无需默认跳转
    const donateLink = document.getElementById('donateLink');
    donateLink.addEventListener('click', (e) => {
        e.preventDefault();
    });
}); 