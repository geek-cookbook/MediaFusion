from db.models import TorrentStreams
from db.schemas import UserData
from streaming_providers.debridlink.client import DebridLink
from streaming_providers.exceptions import ProviderException
from streaming_providers.parser import select_file_index_from_torrent


def get_download_link(
    torrent_info: dict, filename: str, file_index: int, episode: int | None
) -> str:
    file_index = select_file_index_from_torrent(
        torrent_info, filename, file_index, episode
    )
    if torrent_info["files"][file_index]["downloadPercent"] != 100:
        raise ProviderException(
            "Torrent not downloaded yet.", "torrent_not_downloaded.mp4"
        )
    return torrent_info["files"][file_index]["downloadUrl"]


def get_video_url_from_debridlink(
    info_hash: str,
    magnet_link: str,
    user_data: UserData,
    filename: str,
    file_index: int,
    episode: int | None,
    max_retries=5,
    retry_interval=5,
    **kwargs,
) -> str:
    dl_client = DebridLink(token=user_data.streaming_provider.token)

    torrent_info = dl_client.get_available_torrent(info_hash)
    if not torrent_info:
        torrent_id = dl_client.add_magnet_link(magnet_link).get("id")
        torrent_info = dl_client.get_torrent_info(torrent_id)
    else:
        torrent_id = torrent_info.get("id")

    if not torrent_id:
        raise ProviderException(
            "Failed to add magnet link to DebridLink", "transfer_error.mp4"
        )

    if torrent_info.get("error"):
        dl_client.delete_torrent(torrent_id)
        raise ProviderException(
            f"Torrent cannot be downloaded due to error: {torrent_info.get('errorString')}",
            "transfer_error.mp4",
        )

    torrent_info = dl_client.wait_for_status(
        torrent_id, 100, max_retries, retry_interval
    )

    return get_download_link(torrent_info, filename, file_index, episode)


def update_dl_cache_status(
    streams: list[TorrentStreams], user_data: UserData, **kwargs
):
    """Updates the cache status of streams based on DebridLink's instant availability."""

    try:
        dl_client = DebridLink(token=user_data.streaming_provider.token)
        instant_availability_response = dl_client.get_torrent_instant_availability(
            ",".join([stream.id for stream in streams])
        )
        for stream in streams:
            stream.cached = bool(stream.id in instant_availability_response["value"])

    except ProviderException:
        pass


def fetch_downloaded_info_hashes_from_dl(user_data: UserData, **kwargs) -> list[str]:
    """Fetches the info_hashes of all torrents downloaded in the DebridLink account."""
    try:
        dl_client = DebridLink(token=user_data.streaming_provider.token)
        available_torrents = dl_client.get_user_torrent_list()
        if "error" in available_torrents:
            return []
        return [torrent["hashString"] for torrent in available_torrents["value"]]

    except ProviderException:
        return []


def delete_all_torrents_from_dl(user_data: UserData, **kwargs):
    """Deletes all torrents from the DebridLink account."""
    dl_client = DebridLink(token=user_data.streaming_provider.token)
    torrents = dl_client.get_user_torrent_list()
    for torrent in torrents["value"]:
        dl_client.delete_torrent(torrent["id"])
