using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ArcIncCalc.Desktop;

public class MainForm : Form
{
    private WebView2? _webView;

    public MainForm()
    {
        InitializeComponent();
    }

    private void InitializeComponent()
    {
        Text = "明日方舟基建排班与全动态收益测算器";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1440, 920);
        MinimumSize = new Size(1024, 720);
        BackColor = Color.FromArgb(24, 24, 28);
        ForeColor = Color.White;

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(24, 24, 28)
        };
        Controls.Add(_webView);

        Load += async (_, _) => await InitWebViewAsync();
    }

    private async Task InitWebViewAsync()
    {
        if (_webView == null) return;

        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string distPath = Path.Combine(baseDir, "dist");

        if (!Directory.Exists(distPath))
        {
            // Try parent directory
            string parentDist = Path.GetFullPath(Path.Combine(baseDir, "..", "dist"));
            if (Directory.Exists(parentDist))
            {
                distPath = parentDist;
            }
            else
            {
                MessageBox.Show(
                    $"未能在以下路径找到前端资源目录 (dist)：\n{distPath}\n\n请确保解压整合包后，dist 文件夹与 ArcIncCalc.exe 处于同一目录！",
                    "启动失败 - 找不到资源目录",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }
        }

        try
        {
            string userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ArcIncCalc",
                "WebView2Data"
            );
            Directory.CreateDirectory(userDataFolder);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await _webView.EnsureCoreWebView2Async(env);

            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;

            // Map local dist directory to virtual host
            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "app.arcinc",
                distPath,
                CoreWebView2HostResourceAccessKind.Allow
            );

            _webView.CoreWebView2.Navigate("https://app.arcinc/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"初始化 WebView2 失败：\n{ex.Message}\n\n若系统未安装 WebView2 运行时，请从微软官网下载安装 Microsoft Edge WebView2 Runtime。",
                "初始化错误",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
