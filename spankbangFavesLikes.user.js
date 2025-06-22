// ==UserScript==
// @name          SpankBang - Mark Faves and Likes
// @description   Highlights the liked and favorite buttons on videos
// @author        VoltronicAcid
// @version       0.0.8
// @homepageURL   https://github.com/VoltronicAcid/spankbangMarkFavesLikes
// @supportURL    https://github.com/VoltronicAcid/spankbangMarkFavesLikes/issues
// @match         http*://*.spankbang.com/*-*/playlist/*
// @match         http*://*.spankbang.com/*/video/*
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

const getDatabase = async (config) => {
    const databasePromise = new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(config.name, 1);

        openRequest.onupgradeneeded = function () {
            // logMessage("Upgrading/Installing database");
            const { result: db } = openRequest;

            for (const [name, { keyPath, unique }] of Object.entries(config.stores)) {
                const store = db.createObjectStore(name, { keyPath });
                store.createIndex(keyPath, keyPath, { unique });
            }
        };

        openRequest.onsuccess = function () {
            // logMessage("Opened database successfully.");
            const { result: db } = openRequest;
            db.onclose = function () {
                // logMessage("Database closed.");
            }
            db.onerror = function () {
                logError("Database error.");
            }
            resolve(db);
        };

        openRequest.onerror = function () {
            logError(`Error with open database request.`);
            const { code, message, name } = openRequest.error;
            console.error(code, name);
            console.error(message);
            reject(message);
        }
    });

    return databasePromise;
};

async function* getPages(url) {
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
    const query = `a.playlist-item[href$="/${name}/"]`;

    try {
        const response = await fetch(`${document.location.origin}/users/playlists`);
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const page = parser.parseFromString(html, "text/html");

            return page.querySelector(query).href;
        }
    } catch (err) {
        console.error(err);
        console.trace(err);
    }
};

const getVideos = async (storeName) => {
    let videos = [];
    const listUrls = {
        "likes": () => `${document.location.origin}/users/liked`,
        "favorites": async () => await getPlaylistUrl('favorites'),
        "watchLater": async () => await getPlaylistUrl('watch+later'),
    };
    const url = await listUrls[storeName]();

    for await (const page of getPages(url)) {
        videos = videos.concat(
            Array.from(
                page.getElementsByClassName("video-item"))
                .map((div) => ({ id: div.dataset.id, title: div.querySelector("a.thumb").title })
                )
        );
    }

    return videos;
};

const highlightIcon = (storeName) => {
    const HIGHLIGHT_COLOR = "#f08e84";
    const queries = {
        "favorites": "div.fv > svg.i_svg.i_new-ui-heart-outlined",
        "watchLater": "div.wl > svg.i_svg.i_new-ui-time",
        "likes": "span.hot > svg.i_svg.i_new-ui-checkmark-circle-outlined",
    };
    const icon = document.querySelector(queries[storeName]);

    if (icon) icon.style.fill = icon.style.fill ? "" : HIGHLIGHT_COLOR;
};

const populateStore = async (db, storeName) => {
    // logMessage(`Populating ${storeName} store.`);
    const videos = await getVideos(storeName);

    const inserts = new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        transaction.oncomplete = function () {
            // logMessage(`Completed populating "${storeName}" store.`);
            localStorage.setItem("lastPopulated", new Date().getTime());
            resolve();
        };
        transaction.onerror = function (event) {
            logError(`Unable to populate "${storeName}" store.`);
            console.log(event);
            console.log(transaction);
            reject();
        };

        for (const vid of videos) store.put(vid);
    });

    return inserts;
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
        request.onerror = function () {
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
            if (!getRequest.result) {
                const addRequest = store.add(video);
                addRequest.onsuccess = function () {
                    // logMessage(`Added ${JSON.stringify(video)} to ${storeName}`);
                    resolve(addRequest.result);
                };
                addRequest.onerror = function () {
                    logError(`Unable to add ${JSON.stringify(video)} to ${storeName}`);
                    reject(addRequest.error);
                };
            } else {
                const deleteRequest = store.delete(video.id);
                deleteRequest.onsuccess = function () {
                    // logMessage(`Deleted ${JSON.stringify(video)} from ${storeName}`);
                    resolve(deleteRequest.result);
                };
                deleteRequest.onerror = function () {
                    logError(`Unable to delete ${JSON.stringify(video)} from ${storeName}`);
                    reject(deleteRequest.error);
                }
            }
        }
        getRequest.onerror = function () {
            logError(`Get request for ${JSON.stringify(video)} from ${storeName} failed`);
            reject(getRequest.error);
        }
    });

    return toggle;
};

const addIconListener = (db, storeName, video) => {
    const iconQueries = {
        "favorites": "div.fv",
        "watchLater": "div.wl",
        "likes": "span.hot",
    };
    const icon = document.querySelector(iconQueries[storeName]);

    icon.addEventListener("click", async () => {
        await addRemoveVideo(db, storeName, video);
        highlightIcon(storeName);
    });

    return;
};

const main = async () => {
    const video = {
        id: document.getElementById("video")?.dataset.videoid,
        title: document.querySelector("h1.main_content_title")?.title,
    };

    const DB_CONFIG = {
        name: "Videos",
        stores: {
            "favorites": { keyPath: "id", unique: true, },
            "watchLater": { keyPath: "id", unique: true, },
            "likes": { keyPath: "id", unique: true, },
        },
    };

    try {
        const db = await getDatabase(DB_CONFIG);
        const lastPopulated = localStorage.getItem("lastPopulated");

        if (!lastPopulated || new Date().getTime() - lastPopulated > 1000 * 60 * 60 * 24) {
            Promise.allSettled(Object.keys(DB_CONFIG.stores).map((storeName) => populateStore(db, storeName)));
        }

        for (const storeName in DB_CONFIG.stores) {
            addIconListener(db, storeName, video);
            const inStore = await isInStore(db, storeName, video);
            // logMessage(`${video.id} ${inStore ? "IS" : "is NOT"} in "${storeName}" store.`);
            if (inStore) highlightIcon(storeName);
        }
    } catch (err) {
        console.trace(err);
        return;
    }
};

main();
