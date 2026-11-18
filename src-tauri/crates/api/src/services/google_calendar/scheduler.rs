//! The background sync: once shortly after the API starts, then at a fixed interval.

use std::time::Duration;

use tokio::task::JoinHandle;

use super::GoogleCalendarService;

/// The wait before the first sync after the API starts.
pub const FIRST_SYNC_DELAY: Duration = Duration::from_secs(10);
/// The wait between syncs while the app runs.
pub const SYNC_INTERVAL: Duration = Duration::from_secs(15 * 60);

/// The running loop; [`stop`](Self::stop) ends it.
pub struct SyncScheduler(JoinHandle<()>);

impl SyncScheduler {
    pub fn stop(self) {
        self.0.abort();
    }
}

impl GoogleCalendarService {
    /// Syncs after `first_delay` and then every `interval`, skipping the rounds
    /// with no account connected. The route runs the same [`sync`](Self::sync).
    pub fn start_scheduler(&self, first_delay: Duration, interval: Duration) -> SyncScheduler {
        let service = self.clone();
        SyncScheduler(tokio::spawn(async move {
            tokio::time::sleep(first_delay).await;
            loop {
                if service.is_connected().await
                    && let Err(error) = service.sync().await
                {
                    tracing::warn!("Google Calendar sync failed: {error}");
                }
                tokio::time::sleep(interval).await;
            }
        }))
    }
}
