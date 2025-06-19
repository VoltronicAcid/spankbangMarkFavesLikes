// ==UserScript==
// @name          SpankBang - Mark Faves and Likes
// @description   Highlights the liked and favorite buttons on videos
// @author        VoltronicAcid
// @version       0.0.1
// @homepageURL   https://github.com/VoltronicAcid/spankbangMarkFavesLikes
// @supportURL    https://github.com/VoltronicAcid/spankbangMarkFavesLikes/issues
// @match         http*://*.spankbang.com/*/playlist/*
// @match         http*://*.spankbang.com/*/video/*
// @run-at        document-idle
// ==/UserScript==

const VID_ID = document.getElementById("video")?.dataset.videoid;

const logMessage = (msg) => {
    const logStyle = "background-color:cornsilk; color:darkblue; font-size: 12pt; padding: 5px";
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

            const favesStore = db.createObjectStore("favedVideos", { keyPath: "id" });
            favesStore.createIndex("faveIndex", "id", { unique: true });

            const likesStore = db.createObjectStore("likedVideos", { keyPath: "id" });
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
            console.error(name, code);
            console.error(message)
            // const { result: db } = openRequest;
            // db.close();
            reject(message);
        }
    });

    return databasePromise;
};

const getPage = async (url) => {
    logMessage(`Requesting page: ${url}`);
    const response = await fetch(url);
    if (response.ok) {
        const parser = new DOMParser();
        const respText = await response.text();
        return parser.parseFromString(respText, "text/html");
    }

    throw new Error("Unable to get URL");
}

const getAllFavorites = async () => {
    const userPlaylistsURL = `${document.location.origin}/users/playlists`;
    const userPlaylistsPage = await getPage(userPlaylistsURL);
    const favoritesLink = userPlaylistsPage.querySelector('a.playlist-item[href$="/favorites/"]');

    let favoritesPage = await getPage(favoritesLink.href);
    let nextlink = null;
    let videos = [];

    do {
        videos = videos.concat(
            Array.from(
                favoritesPage.getElementsByClassName("video-item"))
                .map(div => ({ id: div.dataset.id, title: div.querySelector("a.thumb").title })
                )
        );

        nextLink = favoritesPage.querySelector("li.next");
        const nextURL = nextLink.querySelector("a").href;

        if (nextURL) favoritesPage = await getPage(nextLink.querySelector("a").href);
    } while (!nextLink?.classList.contains("disabled"));

    return videos;
};

const getAllLikes = async () => { };

const checkStorePopulated = async (db, storeName) => {
    const query = new Promise((resolve, reject) => {
        logMessage(`Checking if ${storeName} is populated.`);
        const transaction = db.transaction(storeName, "readonly");
        // console.log(transaction);
        const store = transaction.objectStore(storeName);
        // console.log(store);

        const request = store.getAllKeys();
        request.onsuccess = function () {
            const { result: keys } = request;
            // console.log(keys);
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
    heart.style.fill = "#f08e84";
};

const populateFavesStore = async (db) => {
    logMessage("Populating favorites");
    const vids = await getAllFavorites();
    // console.log(vids);
    const insert = new Promise((resolve, reject) => {
        const transaction = db.transaction("favedVideos", "readwrite");
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
        const store = transaction.objectStore("favedVideos");
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
    const thumbsUp = document.querySelector("span.hot > svg.i_svg.i_new-ui-thumbs-up");
    thumbsUp.style.fill = "dodgerblue";
};

const populateLikesStore = async (db) => {
    logMessage("Populating likes");
};

const getFaveLikeStatus = async (videoid) => {
    return { isFave: false, isLike: true };
}

const highlightIcons = (status) => {
    if (status.isFave) highlightFaveIcon();
    if (status.isLike) highlightLikeIcon();
};

const main = async () => {
    logMessage("Faves/Likes script is running");
    logMessage(`Video ID:\t${VID_ID}`)
    try {
        const db = await getDatabase();
        // console.log(db);
        const favesPopulated = await checkStorePopulated(db, "favedVideos");
        logMessage(`Faves store populated:\t${favesPopulated}`);

        if (!favesPopulated) {
            populateFavesStore(db);
        }

        const likesPopulated = await checkStorePopulated(db, "likedVideos");
        logMessage(`Likes store populated:\t${likesPopulated}`);

        if (!likesPopulated) {
            populateLikesStore(db);
        }
    } catch (err) {
        console.trace(err);
        return;
    }

    getFaveLikeStatus(VID_ID).then(highlightIcons);
};

main();
