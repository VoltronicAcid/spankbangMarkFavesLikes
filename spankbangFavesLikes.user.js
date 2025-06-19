// ==UserScript==
// @name          SpankBang - Mark Faves and Likes
// @description   Highlights the liked and favorite buttons on videos
// @author        VoltronicAcid
// @version       0.0.3
// @homepageURL   https://github.com/VoltronicAcid/spankbangMarkFavesLikes
// @supportURL    https://github.com/VoltronicAcid/spankbangMarkFavesLikes/issues
// @match         http*://*.spankbang.com/*-*/playlist/*
// @match         http*://*.spankbang.com/*/video/*
// @run-at        document-idle
// ==/UserScript==

const VID_ID = document.getElementById("video")?.dataset.videoid;
const FAVE_STORE = "favedVideos";
const LIKE_STORE = "likedVideos";

const logMessage = (msg) => {
    const logStyle = "background-color:aliceblue; color:darkblue; font-size: 12pt; padding: 5px";
    console.log(`%c${msg}`, logStyle);
};

const logError = (msg) => {
    const logStyle = "background-color:crimson; color:ivory; font-size: 12pt; padding: 5px";
    console.log(`%c${msg}`, logStyle);
};

const getDatabase = async () => {
    const databasePromise = new Promise((resolve, reject) => {
        const openRequest = indexedDB.open("FavesLikes", 1);

        openRequest.onupgradeneeded = function () {
            logMessage("Upgrading/Installing database");
            const { result: db } = openRequest;

            const favesStore = db.createObjectStore(FAVE_STORE, { keyPath: "id" });
            favesStore.createIndex("faveIndex", "id", { unique: true });

            const likesStore = db.createObjectStore(LIKE_STORE, { keyPath: "id" });
            likesStore.createIndex("likeIndex", "id", { unique: true });
        };

        openRequest.onsuccess = function () {
            logMessage("Opened database successfully.");
            const { result: db } = openRequest;
            db.onclose = function () {
                logMessage("Database closed.");
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
            logMessage(`Fetching URL:\t${url}`);
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                url = doc.querySelector("li.next > a").href;
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

const getFavoritesHref = async () => {
    try {
        const response = await fetch(`${document.location.origin}/users/playlists`);
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const page = parser.parseFromString(html, "text/html");

            return page.querySelector('a.playlist-item[href$="/favorites/"]').href;
        }
    } catch (err) {
        console.error(err);
        console.trace(err);
    }
};

const getAllFavorites = async () => {
    let videos = [];

    for await (const page of getPages(await getFavoritesHref())) {
        videos = videos.concat(
            Array.from(
                page.getElementsByClassName("video-item"))
                .map((div) => ({ id: div.dataset.id, title: div.querySelector("a.thumb").title })
                )
        );
    }

    return videos;
};

const getAllLikes = async () => {
    let videos = [];

    for await (const page of getPages(`${document.location.origin}/users/liked`)) {
        videos = videos.concat(
            Array.from(
                page.getElementsByClassName("video-item"))
                .map((div) => ({ id: div.dataset.id, title: div.querySelector("a.thumb").title })
                )
        );
    }

    return videos;
};

const checkStorePopulated = async (db, storeName) => {
    const query = new Promise((resolve, reject) => {
        logMessage(`Checking if ${storeName} is populated.`);
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);

        const request = store.getAllKeys();
        request.onsuccess = function () {
            const { result: keys } = request;
            resolve(keys.length > 0);
        };
        request.onerror = function () {
            logError(`Error with request on store ${storeName}`);
            reject(request.error);
        };
    });

    return query;
};

const highlightFaveIcon = () => {
    logMessage("Coloring Fave");
    const heart = document.querySelector("div.fv > svg.i_svg.i_new-ui-heart-outlined");
    if (heart) heart.style.fill = "#f08e84";
};

const populateFavesStore = async (db) => {
    logMessage("Populating favorites");
    const vids = await getAllFavorites();

    const insert = new Promise((resolve, reject) => {
        const transaction = db.transaction(FAVE_STORE, "readwrite");
        transaction.oncomplete = function () {
            logMessage("Populate Faves Store transaction completed.");
            resolve();
        };
        transaction.onerror = function (event) {
            logError("Populate Faves Store transaction generated an error.");
            console.log(event);
            console.log(transaction);
            reject();
        };
        const store = transaction.objectStore(FAVE_STORE);
        for (const vid of vids) {
            store.add(vid);
            if (vid.id === VID_ID) {
                highlightFaveIcon();
            }
        }
    });

    return insert
};

const highlightLikeIcon = () => {
    logMessage("Coloring Like");
    const checkmark = document.querySelector("span.hot > svg.i_svg.i_new-ui-checkmark-circle-outlined");
    if (checkmark) {
        checkmark.style.fill = "dodgerblue";
        return;
    }

    const thumbsUp = document.querySelector("span.hot > svg.i_svg.i_new-ui-thumbs-up");
    if (thumbsUp) thumbsUp.style.fill = "dodgerblue";
};

const populateLikesStore = async (db) => {
    logMessage("Populating likes");
    const vids = await getAllLikes();

    const insert = new Promise((resolve, reject) => {
        const transaction = db.transaction(LIKE_STORE, "readwrite");
        transaction.oncomplete = function () {
            logMessage("Populate Likes Store transaction completed.");
            resolve();
        };
        transaction.onerror = function (event) {
            logError("Populate Likes Store transaction generated an error.");
            console.log(event);
            console.log(transaction);
            reject();
        };
        const store = transaction.objectStore(LIKE_STORE);
        for (const vid of vids) {
            store.add(vid);

            if (vid.id === VID_ID) highlightLikeIcon();
        }
    });

    return insert;
};

const main = async () => {
    logMessage("Faves/Likes script is running");
    logMessage(`Video ID:\t${VID_ID}`);

    try {
        const db = await getDatabase();
        const favesPopulated = await checkStorePopulated(db, FAVE_STORE);
        logMessage(`Faves store populated:\t${favesPopulated}`);

        if (!favesPopulated) {
            populateFavesStore(db);
        }

        const likesPopulated = await checkStorePopulated(db, LIKE_STORE);
        logMessage(`Likes store populated:\t${likesPopulated}`);

        if (!likesPopulated) {
            populateLikesStore(db);
        }
    } catch (err) {
        console.trace(err);
        return;
    }
};

main();
