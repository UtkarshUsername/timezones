# Timezones

Compare a time range across cities, or create a group availability poll.

[Open the app](https://timezones.lakebed.app)

## Group polls

Open **Group polls** to create an event with up to 14 candidate dates, a daily time range, a time zone, and a meeting duration. Share the poll URL. Each participant can mark 15-minute slots and update their own response from the same browser session. The results show availability counts and the best continuous windows. Poll links are accessible to anyone who has the URL; guest sessions protect each person's edits.

## Development

```sh
npx lakebed dev
```

The local database resets when the dev server restarts. Use `?lakebed_guest=alice` and `?lakebed_guest=bob` to test separate participants locally.
