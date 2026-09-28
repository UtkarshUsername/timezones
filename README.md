# Timezones

Compare a time range across cities, or create a group availability poll.

[Open the app](https://timezones.lakebed.app)

## Group polls

Open **Group polls** to create an event. Click or drag across the calendar to choose up to 14 dates, set a daily time range, then share the poll URL. Participants join with a name and paint 15-minute availability slots. Changes save automatically. The group grid uses a green gradient to show how many people are free, and hovering a slot shows who can attend.

Poll links are accessible to anyone who has the URL; guest sessions protect each person's edits.

## Development

```sh
npx lakebed dev
```

The local database resets when the dev server restarts. Use `?lakebed_guest=alice` and `?lakebed_guest=bob` to test separate participants locally.
