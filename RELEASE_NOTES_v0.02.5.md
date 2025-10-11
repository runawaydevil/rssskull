# RSS Skull Bot v0.02.5 Release Notes

## 🚀 **Almost Stable Release - Major Feature Update**

RSS Skull Bot v0.02.5 represents a significant milestone in the project's evolution, introducing intelligent feed discovery and multi-format support that makes the bot more user-friendly and powerful than ever before.

---

## 🎯 **Key Highlights**

### 🔍 **Intelligent Feed Discovery**
- **Automatic feed detection** from any website URL
- **Multi-strategy discovery**: HTML `<link>` tags, common paths, WordPress detection
- **Smart URL normalization**: Handles `pablo.space`, `www.pablo.space`, `https://pablo.space`
- **Confidence-based ranking** for optimal feed selection

### 📱 **New Commands**
- **`/discover <url>`** - Discover available feeds from any website
- **`/descobrir <url>`** - Portuguese alias for discover command
- **Enhanced `/add`** - Now includes automatic feed discovery as fallback

### 🔧 **Multi-Format Support**
- **RSS 2.0** - Full compatibility with traditional RSS feeds
- **Atom 1.0** - Complete RFC 4287 compliance (preferred over RSS)
- **JSON Feed 1.1** - Modern feed format support
- **Automatic detection** and parsing of all formats

---

## ✨ **New Features**

### 🌐 **URL Normalization**
The bot now automatically handles various URL formats:
- `pablo.space` → `https://pablo.space`
- `www.pablo.space` → `https://pablo.space`
- `https://pablo.space` → `https://pablo.space`
- `http://pablo.space` → `https://pablo.space`

### 🚫 **Duplicate Prevention**
Smart duplicate detection prevents:
- Duplicate feed names in the same chat
- Duplicate URLs (original and RSS)
- Adding discovered feeds that already exist

### ⚡ **Performance Improvements**
- **Conditional HTTP Caching** - Bandwidth-saving with If-Modified-Since and ETag headers
- **Enhanced date parsing** - Robust handling of various date formats
- **Fixed duplicate posts** - Improved deduplication logic
- **Orphaned job cleanup** - Automatic cleanup of deleted feed jobs

---

## 🛠️ **Technical Improvements**

### 🔧 **New Utilities**
- **`FeedTypeDetector`** - Automatic feed type detection
- **`JsonFeedParser`** - JSON Feed 1.1 parsing
- **`FeedDiscovery`** - Multi-strategy feed discovery
- **`UrlNormalizer`** - URL format normalization

### 📊 **Enhanced Services**
- **Updated `RSSService`** with multi-format support
- **Enhanced `FeedService`** with discovery integration
- **Improved `NotificationService`** with better formatting

### 🎨 **UI/UX Improvements**
- **Updated message templates** with new emojis (🔥 for titles, 🔗 for links)
- **Simplified `/discover` output** - Clean, focused results
- **Enhanced help system** - Added `/discover` to help menu
- **Bilingual support** - Full Portuguese and English support

---

## 🐛 **Bug Fixes**

### 🔧 **Critical Fixes**
- **Fixed "Invalid time value" errors** for Reddit feeds
- **Fixed duplicate post sending** issue
- **Fixed "Feed not found in database"** errors after `/reset`
- **Fixed orphaned jobs** in Redis queue

### 📱 **User Experience**
- **Improved Reddit content formatting** - Better HTML entity decoding
- **Enhanced error messages** - Clear, actionable feedback
- **Better template handling** - Improved message formatting

---

## 📈 **Performance Metrics**

### ⚡ **Speed Improvements**
- **Reddit rate limiting**: Optimized to 3 requests per 10 minutes
- **Conditional caching**: Up to 90% bandwidth reduction
- **Smart deduplication**: Prevents duplicate processing

### 🔄 **Reliability**
- **Robust date parsing**: Multiple fallback strategies
- **Enhanced error handling**: Better recovery from failures
- **Improved job management**: Cleaner queue operations

---

## 🚀 **Migration Guide**

### For Existing Users
- **No action required** - All existing feeds continue to work
- **New features available** - Try `/discover` with your favorite websites
- **Enhanced `/add`** - Now works with website URLs automatically

### For New Users
- **Start with `/discover`** - Explore available feeds on any website
- **Use `/add` with confidence** - Automatic discovery handles the rest
- **Enjoy bilingual support** - Commands work in Portuguese and English

---

## 🎯 **What's Next**

This release sets the foundation for future enhancements:
- **WhatsApp integration** (non-official API)
- **Batch feed operations** - "Add all these feeds"
- **Automatic suggestions** - Related feed recommendations
- **Advanced filtering** - AI-powered content filtering

---

## 🙏 **Acknowledgments**

Special thanks to the community for feedback and testing that made this release possible. Your input helped shape the intelligent discovery features and improved user experience.

---

## 📞 **Support**

- **GitHub Issues**: [Report bugs and request features](https://github.com/runawaydevil/rssskull/issues)
- **GitHub Discussions**: [Community discussions](https://github.com/runawaydevil/rssskull/discussions)
- **Direct Support**: [@runawaydevil](https://t.me/runawaydevil) on Telegram

---

**RSS Skull Bot v0.02.5 - Making RSS feeds more accessible, one discovery at a time!** 🎉
