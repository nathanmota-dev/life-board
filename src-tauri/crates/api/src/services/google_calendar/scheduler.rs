//! The background sync: once shortly after the API starts, then at a fixed interval,
//! plus the worker that sends each change made in Life Board.

use std::time::Duration;

use tokio::task::JoinHandle;

use super::GoogleCalendarService;

/// The wait before the first sync after the API starts.
pub const FIRST_SYNC_DELAY: Duration = Duration::from_secs(10);
/// The wait between syncs while the app runs.
pub const SYNC_INTERVAL: Duration = Duration::from_secs(15 * 60);

/// The running loops (the periodic sync and the sender of changes); [`stop`](Self::stop) ends them.
pub struct SyncScheduler(Vec<JoinHandle<()>>);

impl SyncScheduler {
    pub fn stop(self) {
        self.0.iter().for_each(JoinHandle::abort);
    }
}

impl GoogleCalendarService {
    /// Sends each change made in Life Board as soon as the calendar rings, without
    /// waiting for the next sync. Skips the rounds with no account connected.
    pub fn start_sender(&self) -> SyncScheduler {
        let sender = self.clone();
        let wake = self.wake();
        SyncScheduler(vec![tokio::spawn(async move {
            loop {
                wake.notified().await;
                if sender.is_connected().await
                    && let Err(error) = sender.flush().await
                {
                    tracing::warn!("Sending changes to Google Calendar failed: {error}");
                }
            }
        })])
    }

    /// Syncs after `first_delay` and then every `interval`, skipping the rounds
    /// with no account connected, and starts the sender. The route runs the same
    /// [`sync`](Self::sync).
    pub fn start_scheduler(&self, first_delay: Duration, interval: Duration) -> SyncScheduler {
        let service = self.clone();
        let periodic = tokio::spawn(async move {
            tokio::time::sleep(first_delay).await;
            loop {
                if service.is_connected().await
                    && let Err(error) = service.sync().await
                {
                    tracing::warn!("Google Calendar sync failed: {error}");
                }
                tokio::time::sleep(interval).await;
            }
        });
        let mut handles = self.start_sender().0;
        handles.push(periodic);
        SyncScheduler(handles)
    }
}
