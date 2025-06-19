// ==UserScript==
// @name          SpankBang - Mark Faves and Likes
// @description   Highlights the liked and favorite buttons on videos
// @author        VoltronicAcid
// @version       0.0.7
// @homepageURL   https://github.com/VoltronicAcid/spankbangMarkFavesLikes
// @supportURL    https://github.com/VoltronicAcid/spankbangMarkFavesLikes/issues
// @match         http*://*.spankbang.com/*-*/playlist/*
// @match         http*://*.spankbang.com/*/video/*
// @run-at        document-idle
// ==/UserScript==

const VID_ID = document.getElementById("video")?.dataset.videoid;
const VID_TITLE = document.querySelector("h1.main_content_title")?.title;
const FAVE_STORE = "favorites";
const LIKE_STORE = "likes";
const LATER_STORE = "watchLater";
const HIGHLIGHT_COLOR = "#f08e84";

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
            favesStore.createIndex("faveIdx", "id", { unique: true });

            const likesStore = db.createObjectStore(LIKE_STORE, { keyPath: "id" });
            likesStore.createIndex("likeIdx", "id", { unique: true });

            const laterStore = db.createObjectStore(LATER_STORE, { keyPath: "id" });
            laterStore.createIndex("laterIdx", "id", { unique: true });
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

const getPlaylistUrl = async (name) => {
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

const getAllFavorites = async () => {
    let videos = [];

    for await (const page of getPages(await getPlaylistUrl('favorites'))) {
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

const isStorePopulated = async (db, storeName) => {
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

const highlightFaveIcon = (status) => {
    logMessage(`${status ? "Setting" : "Unsetting"} Fave icon.`);
    const heart = document.querySelector("div.fv > svg.i_svg.i_new-ui-heart-outlined");
    if (heart) heart.style.fill = status ? HIGHLIGHT_COLOR : "";
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
            if (vid.id === VID_ID) highlightFaveIcon(true);
        }
    });

    return insert
};

const highlightLikeIcon = (status = true) => {
    logMessage(`${status ? "Setting" : "Unsetting"} Like icon.`);
    const checkmark = document.querySelector("span.hot > svg.i_svg.i_new-ui-checkmark-circle-outlined");
    if (checkmark) checkmark.style.fill = HIGHLIGHT_COLOR;
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

            if (vid.id === VID_ID) highlightLikeIcon(true);
        }
    });

    return insert;
};

const isInStore = async (db, storeName) => {
    const query = new Promise((resolve, reject) => {
        logMessage(`Checking ${storeName} for ${VID_ID}`);
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);

        const request = store.get(VID_ID);
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

const addToStore = async (db, storeName) => {
    const video = { id: VID_ID, title: VID_TITLE };

    const insert = new Promise((resolve, reject) => {
        logMessage(`Adding ${VID_ID} to ${storeName}.`);
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        const request = store.put(video);
        request.onsuccess = function () {
            logMessage(`Successfully added ${VID_ID}.`);
            resolve();
        };
        request.onerror = function () {
            logError(`Error with put request on store ${storeName}`);
            reject(request.error);
        };
    });

    return insert;
};

const removeFromStore = async (db, storeName) => {
    const remove = new Promise((resolve, reject) => {
        logMessage(`Removing ${VID_ID} from ${storeName}.`);
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        const request = store.delete(VID_ID);
        request.onsuccess = function () {
            logMessage(`Successfully deleted ${VID_ID}.`);
            resolve();
        };
        request.onerror = function () {
            logError(`Error with delete request on store ${storeName}`);
            reject(request.error);
        };
    });

    return remove;
};

const addListener = (icon, isSaved, db) => {
    const classStore = { hot: LIKE_STORE, fv: FAVE_STORE };
    const storeName = classStore[icon.className];
    logMessage(`${icon.className} = ${storeName}`);

    icon.addEventListener("click", () => {
        if (isSaved) {
            logMessage('Removing');
            removeFromStore(db, storeName);
        } else {
            logMessage(`Adding`)
            addToStore(db, storeName);
        }

        isSaved = !isSaved;
        if (storeName === FAVE_STORE) highlightFaveIcon(isSaved);
        if (storeName === LIKE_STORE) highlightLikeIcon(isSaved);
    });
};

const main = async () => {
    logMessage("Faves/Likes script is running");
    logMessage(`Vid Title:\t${VID_TITLE}`);
    logMessage(`Video ID :\t${VID_ID}`);

    try {
        const db = await getDatabase();
        const favesPopulated = await isStorePopulated(db, FAVE_STORE);
        logMessage(`Faves store populated:\t${favesPopulated}`);

        if (!favesPopulated) populateFavesStore(db);

        const likesPopulated = await isStorePopulated(db, LIKE_STORE);
        logMessage(`Likes store populated:\t${likesPopulated}`);

        if (!likesPopulated) populateLikesStore(db);

        const isFaved = await isInStore(db, FAVE_STORE);
        addListener(document.querySelector("div.fv"), isFaved, db);
        logMessage(`${VID_ID} ${isFaved ? "is" : "is not"} a favorite video.`);
        if (isFaved) highlightFaveIcon(true);

        const isLiked = await isInStore(db, LIKE_STORE);
        addListener(document.querySelector("span.hot"), isLiked, db);
        logMessage(`${VID_ID} ${isLiked ? "is" : "is not"} a liked video.`);
        if (isLiked) highlightLikeIcon(true);
    } catch (err) {
        console.trace(err);
        return;
    }
};

main();
