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

const logMessage = (msg) => {
    const logStyle = "background-color:cornsilk; color:darkblue; font-size: 12pt; padding: 5px";
    console.log(`%c${msg}`, logStyle);
};
const logError = (msg) => {
    const logStyle = "background-color:crimson; color:ivory; font-size: 12pt; padding: 5px";
    console.log(`%c${msg}`, logStyle);
};

const getPage = async (url) => {
    // logMessage(`Requesting page: ${url}`);
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
                .map(div => ({ videoid: div.dataset.id, title: div.querySelector("a.thumb").title })
                )
        );

        nextLink = favoritesPage.querySelector("li.next");
        const nextURL = nextLink.querySelector("a").href;

        if (nextURL) favoritesPage = await getPage(nextLink.querySelector("a").href);
    } while (!nextLink?.classList.contains("disabled"));

    return videos;
};

const getAllLikes = async () => { };

const storesArePopulated = async () => {
    return { favesStorePopulated: true, likesStorePopulated: true };
};

const populateFavesStore = async () => { };

const populateLikesStore = async () => { };

const getFaveLikeStatus = async (videoid) => {
    return { isFave: true, isLike: true };
}

const highlightFaveIcon = () => {
    logMessage('Setting Fave Color');
    const heart = document.querySelector("div.fv > svg.i_svg.i_new-ui-heart-outlined");
    heart.style.fill = "fuchsia";
};

const highlightLikeIcon = () => {
    logMessage('Setting Like color');
    const thumbsUp = document.querySelector("span.hot > svg.i_svg.i_new-ui-thumbs-up");
    thumbsUp.style.fill = "dodgerblue";
};

const highlightIcons = (status) => {
    if (status.isFave) highlightFaveIcon();
    if (status.isLike) highlightLikeIcon();
};

const main = async () => {
    logMessage("Faves/Likes script is running");

    const video = document.getElementById("video");
    if (video) {
        logMessage(`The ID of this video is:\t${video.dataset.videoid}`);

    }
    const videoId = video?.dataset.videoid;
    logMessage(`VIDEO ID:\t${videoId}`);

    const { favesStorePopulated, likesStorePopulated } = await storesArePopulated();
    if (!favesStorePopulated) {
        populateFavesStore();
    }

    if (!likesStorePopulated) {
        populateLikesStore();
    }

    getFaveLikeStatus(videoId).then(highlightIcons);
};

main();
