# Log Viewer - Timeline

A beautiful timeline-based log viewer for visualizing and analyzing JSON logs.

## Features

### 🚀 Performance

- **Optimized for 9000+ logs** - Smooth rendering with React.useMemo
- **Smart lane assignment** - Prevents overlapping with 4-lane layout
- **Efficient rendering** - Only recalculates on zoom/data changes

### 📊 Timeline Visualization

- **Rectangular event boxes** - Tag names visible directly on timeline
- **Multi-lane layout** - 4 lanes to prevent overlapping
- **Automatic stacking** - Logs stack vertically when close together
- **Wide timeline** - 200px per second spacing for clarity
- **Color-coded borders** - Instant visual categorization

### ⏱️ Time Controls

- **Auto time range** - Shows first/last log timestamps and duration
- **8 zoom levels** - From 10 seconds to 1 hour visible on screen
- **Current position** - Shows what time you're viewing while scrolling
- **Drag to scroll** - Mouse drag support for easy navigation

### 🎨 Visual Features

- **Color-coded events**: Red (errors), Orange (warnings), Purple (payments), Blue (cart), Green (API), Gray (info)
- **Interactive boxes**: Click any log to view full JSON details
- **Hover effects**: Scale animation and full tag name in tooltip
- **Selection state**: Highlighted border for selected logs

### 📋 Log Details

- **JSON syntax highlighting** - Beautiful, readable JSON viewer
- **Structured summary** - Tag, level, type, service at a glance
- **Copy to clipboard** - One-click copy of log data
- **Request ID tracking** - Full tracing information

## Getting Started

### Installation

```bash
npm install
```

### Running the Application

```bash
npm run dev
```

The application will open at `http://localhost:3000`

### Usage

1. **Upload a JSON Log File**: Drag and drop or click to browse for a JSON file
2. **View Timeline**: Logs are automatically arranged on a horizontal timeline based on timestamps
3. **Navigate**:
   - Scroll horizontally with mouse wheel
   - Drag the timeline left/right
   - Use the scrollbar
4. **Inspect Logs**: Click on any log marker to view full details in the bottom panel
5. **Copy Data**: Use the "Copy JSON" button to copy log details

## Log Format

### Elasticsearch/Kibana Logs

The tool automatically parses Elasticsearch/Kibana log exports. It extracts timestamps from the log message itself (not the Kibana timestamp).

**Expected format:**

```json
{
  "rawResponse": {
    "hits": {
      "hits": [
        {
          "_source": {
            "message": "requestId | traceId | spanId | | podName | service | level | type | tag | data at 2025-10-16 20:21:00.109",
            "pod_name": "xyz-lz6r2",
            "timestamp": "2025-10-16T20:24:39.325Z"
          }
        }
      ]
    }
  }
}
```

**The tool parses:**

- **Timestamp**: Extracted from the message after "at" (e.g., `at 2025-10-16 20:21:00.109`)
- **Tag**: Function/action name
- **Level**: Debug, Info, Error, Warning
- **Type**: FunctionCalled, DBQueryResult, etc.
- **Data**: JSON data in the message

### Generic JSON Logs

For other formats, the tool will recursively search for objects with timestamp fields (`timestamp`, `time`, `date`).

## Log Types & Colors

Logs are automatically categorized and color-coded based on content:

- **Error** (Red): Contains "error" or "fail"
- **Warning** (Orange): Contains "warn"
- **API** (Green): Contains "gql" or "api"
- **Info** (Gray): Default for other logs

## Building for Production

```bash
npm run build
npm run preview
```

## Tech Stack

- React 18
- Vite
- CSS3 (no external UI libraries)
- Modern JavaScript (ES6+)

## License

ISC
