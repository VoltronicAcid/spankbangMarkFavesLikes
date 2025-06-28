// ==UserScript==
// @name          SpankBang - Mark Faves and Likes
// @description   Highlights the liked and favorite buttons on videos
// @author        VoltronicAcid
// @version       0.1.6
// @homepageURL   https://github.com/VoltronicAcid/spankbangMarkFavesLikes
// @supportURL    https://github.com/VoltronicAcid/spankbangMarkFavesLikes/issues
// @match         https://*spankbang.com/*
// @run-at        document-idle 
// ==/UserScript==

const logMessage = (msg) => {
    const logStyle = "background-color:aliceblue; color:darkblue; font-size: 12pt; padding: 5px";
    console.log(`%c${msg}`, logStyle);
};

const logError = (msg) => {
    const logStyle = "background-color:crimson; color:ivory; font-size: 12pt; padding: 5px";
    console.log(`%c${msg}`, logStyle);
};

const openDatabase = async (config) => {
    const name = "Videos";
    const version = 1;

    return new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(name, version);

        openRequest.onupgradeneeded = function () {
            // logMessage("Upgrading/Installing database");
            const { result: db } = openRequest;

            for (const { name, options, indexes } of config.stores) {
                const store = db.createObjectStore(name, options);

                for (const { name, keyPath, options } of indexes) {
                    store.createIndex(name, keyPath, options);
                }
            }
        };

        openRequest.onsuccess = function () {
            // logMessage("Opened database successfully.");
            config.db = openRequest.result;
            const { result: db } = openRequest;
            db.onclose = function () {
                logMessage("Database closed.");
            }
            db.onerror = function () {
                logError("Database error.");
            }
            resolve(db);
        };

        openRequest.onerror = function (event) {
            logError(`Error with open database request.`);
            reject(event.target.error);
        }
    });
};

async function* getPlaylistPages(url) {
    while (url) {
        try {
            // logMessage(`Fetching URL:\t${url}`);
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                url = doc.querySelector("li.next > a")?.href;
                yield doc;
            } else {
                throw new Error(`Unable to fetch URL:\n${url}\nStatus Code:\t${response.status}`);
            }
        } catch (err) {
            console.error(err);
            console.trace(err);
            break;
        }
    }
};

const getPlaylistUrl = async (name) => {
    // logMessage(`Getting link for "${name}".`);
    try {
        const response = await fetch(`${document.location.origin}/users/playlists`);
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const page = parser.parseFromString(html, "text/html");

            return page.querySelector(`a.playlist-item[href$="/${name}/"]`).href;
        }
    } catch (err) {
        console.error(err);
    }
};

const divToVideo = (videoDiv) => {
    const link = videoDiv.querySelector("a[title]");

    if (link) return { id: videoDiv.dataset.id, title: link.title, };
};

const getPlaylistVideos = async (url) => {
    let videos = [];
    for await (const page of getPlaylistPages(url)) {
        videos = videos.concat(
            Array.from(
                page.getElementsByClassName("video-item"))
                .map(divToVideo)
        );
    }

    return videos;
};

const highlightIcon = (selector, color) => {
    const icon = document.querySelector(selector);

    if (icon) icon.style.fill = icon.style.fill ? "" : color;
};

const populateStores = async (config) => {
    const storePromises = [];
    const { db } = config;

    for (const storeName of Array.from(db.objectStoreNames)) {
        const videos = await getPlaylistVideos(config.playlistURLs[storeName]);

        storePromises.push(new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, "readwrite");
            transaction.oncomplete = () => resolve(transaction);
            transaction.onerror = function (event) {
                event.stopPropagation();
                const error = {
                    message: `${event.target.error.name}: ${event.target.error.message}`,
                    storeName,
                };
                reject(error);
            };
            transaction.onabort = function (event) {
                const error = {
                    message: `${event.target.error.name}: ${event.target.error.message}`,
                    storeName,
                };
                reject(error);
            };

            const store = transaction.objectStore(storeName);
            for (const video of videos) {
                const request = store.put(video);
                request.onerror = function (event) {
                    event.stopPropagation();
                    const error = {
                        message: `${event.target.error.name}: ${event.target.error.message}`,
                        storeName,
                        video,
                    };
                    reject(error);
                };
            }
        }));
    }

    return Promise.allSettled(storePromises);
};

const isInStore = async (db, storeName, video) => {
    const query = new Promise((resolve, reject) => {
        // logMessage(`Checking "${storeName}" for ${video.id}`);
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);

        const request = store.get(video.id);
        request.onsuccess = function () {
            resolve(request.result !== undefined);
        };
        request.onerror = function (event) {
            event.stopPropagation();
            logError(`Error with request on store ${storeName}`);
            reject(request.error);
        };
    });

    return query;
};

const addRemoveVideo = async (db, storeName, video) => {
    const toggle = new Promise((resolve, reject) => {
        // logMessage(`Toggling ${video.id} from ${storeName}`);
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        const getRequest = store.get(video.id);
        getRequest.onsuccess = function () {
            if (getRequest.result) {
                const deleteRequest = store.delete(video.id);
                deleteRequest.onsuccess = function () {
                    // logMessage(`Deleted ${JSON.stringify(video)} from ${storeName}`);
                    resolve(deleteRequest.result);
                };
                deleteRequest.onerror = function (event) {
                    event.stopPropagation();
                    logError(`Unable to delete ${JSON.stringify(video)} from ${storeName}`);
                    reject(deleteRequest.error);
                }
            } else {
                const addRequest = store.add(video);
                addRequest.onsuccess = function () {
                    // logMessage(`Added ${JSON.stringify(video)} to ${storeName}`);
                    resolve(addRequest.result);
                };
                addRequest.onerror = function (event) {
                    event.stopPropagation();
                    logError(`Unable to add ${JSON.stringify(video)} to ${storeName}`);
                    reject(addRequest.error);
                };
            }
        }
        getRequest.onerror = function (event) {
            event.stopPropagation();
            logError(`Get request for ${JSON.stringify(video)} from ${storeName} failed`);
            reject(getRequest.error);
        }
    });

    return toggle;
};

const addIconListener = (config, storeName, video) => {
    const { db, videoIcons } = config;
    const { container, selector, highlightColor } = videoIcons[storeName];

    const icon = document.querySelector(container);

    icon.addEventListener("click", () => {
        addRemoveVideo(db, storeName, video)
            .catch((err) => console.error(`${err}\n${video.id} - ${video.title}`));
        highlightIcon(selector, highlightColor);
    });

    return;
};

const getPopoutMenuEventHandler = (db, storeName, video) => {
    const handler = function () {
        if (video) {
            addRemoveVideo(db, storeName, video)
                .catch((err) => console.error(`${err}\n${video.id} - ${video.title}`));
        }
    };

    return handler;
};

const observePopoutMenu = (config) => {
    const { db, menuIcons } = config;
    const popoutMenu = document.getElementById("popout_menu");

    const observer = new MutationObserver((records) => {
        if (records.some((record) => record.target.style.display === "block")) {
            for (const { selector, name, highlightColor } of menuIcons) {
                const icon = popoutMenu.querySelector(selector);
                icon.firstElementChild.style.fill = "";

                setTimeout(async () => {
                    const span = document.querySelector("span[aria-selected=true]");
                    const videoDiv = span.closest("div.video-item, div.js-video-item");
                    const video = divToVideo(videoDiv);

                    if (await isInStore(db, name, video)) icon.firstElementChild.style.fill = highlightColor;
                }, 0);
            }
        }
    });
    observer.observe(popoutMenu, { attributes: true, attributeFilter: ["style"], });
};

const addPopoutMenuEventHandlers = (config) => {
    const { db } = config;
    const popoutMenu = document.getElementById("popout_menu");

    const videoDivs = document.querySelectorAll("div.video-item, div.js-video-item");
    for (const { name, selector } of config.menuIcons) {
        videoDivs.forEach((videoDiv) => {
            const handler = getPopoutMenuEventHandler(db, name, divToVideo(videoDiv));
            const menuSpan = videoDiv.querySelector("span.show-items-menu-trigger");

            if (!menuSpan) return;

            const innerSpan = menuSpan.querySelector("span.items-center");

            const observer = new MutationObserver((mutationRecords) => {
                const icon = popoutMenu.querySelector(selector);
                for (const record of mutationRecords) {
                    if (record.target.ariaSelected === "true") {
                        icon.addEventListener("click", handler);
                    } else if (record.target.ariaSelected === "false") {
                        icon.removeEventListener("click", handler);
                    }
                }
            });
            observer.observe(innerSpan, { attributes: true, attributeFilter: ["aria-selected"] });
        });
    }
};

const updatePopoutMenu = (config) => {
    const popoutMenu = document.getElementById("popout_menu");

    if (popoutMenu) {
        observePopoutMenu(config);
        addPopoutMenuEventHandlers(config);
    }
};

const updateVideoIcons = (config) => {
    const { db, stores } = config;
    const video = {
        id: document.getElementById("video")?.dataset.videoid,
        title: document.querySelector("h1.main_content_title")?.title,
    };

    for (const { name } of stores) {
        addIconListener(config, name, video);
        // // logMessage(`${video.id} ${inStore ? "IS" : "is NOT"} in "${name}" store.`);
        const { selector, highlightColor } = config.videoIcons[name];
        isInStore(db, name, video).then((exists) => exists && highlightIcon(selector, highlightColor));
    }
};

const main = async () => {
    const CONFIG = {
        db: undefined,
        stores: [
            {
                name: "favorites",
                options: {
                    keyPath: "id",
                },
                indexes: [
                    {
                        name: "id",
                        keyPath: "id",
                        options: {
                            unique: true,
                        },
                    },
                ],
            },
            {
                name: "watchLater",
                options: {
                    keyPath: "id",
                },
                indexes: [
                    {
                        name: "id",
                        keyPath: "id",
                        options: {
                            unique: true,
                        },
                    },
                ],
            },
            {
                name: "likes",
                options: {
                    keyPath: "id",
                },
                indexes: [
                    {
                        name: "id",
                        keyPath: "id",
                        options: {
                            unique: true,
                        },
                    },
                ],
            },
        ],
        menuIcons: [
            {
                name: "watchLater",
                selector: ".b.wl",
                highlightColor: "#f08e84",
            },
            {
                name: "favorites",
                selector: ".b.fav",
                highlightColor: "#f08e84",
            },
        ],
        videoIcons: {
            favorites: {
                container: "div.fv",
                selector: "div.fv > svg.i_svg.i_new-ui-heart-outlined",
                highlightColor: "#f08e84",
            },
            watchLater: {
                container: "div.wl",
                selector: "div.wl > svg.i_svg.i_new-ui-time",
                highlightColor: "#f08e84",
            },
            likes: {
                container: "span.hot",
                selector: "span.hot > svg.i_svg.i_new-ui-checkmark-circle-outlined",
                highlightColor: "#f08e84",
            },
        },
        playlistURLs: {
            favorites: await getPlaylistUrl('favorites'),
            watchLater: await getPlaylistUrl('watch+later'),
            likes: `${document.location.origin}/users/liked`,
        },
    };

    try {
        await openDatabase(CONFIG);
        const lastPopulated = localStorage.getItem("lastPopulated");

        if (!lastPopulated || new Date().getTime() - lastPopulated > 1000 * 60 * 60 * 24) {
            await populateStores(CONFIG)
            localStorage.setItem("lastPopulated", new Date().getTime());
        }

        const videoPlayer = document.querySelector("video#main_video_player_html5_api");
        if (videoPlayer) {
            updateVideoIcons(CONFIG);
        }

        updatePopoutMenu(CONFIG);
    } catch (err) {
        console.trace(err);
    }
};

main();
