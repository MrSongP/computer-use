using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

internal sealed class ComputerUseP5SmokeApp : Form
{
    private readonly TextBox inputBox;
    private readonly Button applyButton;
    private readonly ComboBox modePicker;
    private readonly Button pointerButton;
    private readonly TextBox keyboardBox;
    private readonly Panel scrollSurface;
    private readonly Panel dragSurface;
    private readonly Label statusLabel;
    private bool dragging;

    public ComputerUseP5SmokeApp()
    {
        Text = "ComputerUse P5 Smoke";
        Width = 760;
        Height = 560;
        StartPosition = FormStartPosition.Manual;
        Location = new Point(160, 160);
        KeyPreview = true;

        inputBox = new TextBox
        {
            Left = 24,
            Top = 24,
            Width = 260,
            AccessibleName = "Input Value"
        };
        inputBox.TextChanged += delegate
        {
            statusLabel.Text = "Typed:" + inputBox.Text;
        };

        applyButton = new Button
        {
            Left = 304,
            Top = 20,
            Width = 128,
            Height = 30,
            Text = "Apply"
        };
        applyButton.Click += delegate
        {
            statusLabel.Text = "Clicked:" + inputBox.Text;
        };

        modePicker = new ComboBox
        {
            Left = 24,
            Top = 78,
            Width = 220,
            DropDownStyle = ComboBoxStyle.DropDownList,
            AccessibleName = "Mode Picker"
        };
        modePicker.Items.AddRange(new object[] { "Alpha", "Beta", "Gamma" });
        modePicker.SelectedIndex = 0;
        modePicker.DropDown += delegate
        {
            statusLabel.Text = "Expanded";
        };
        modePicker.DropDownClosed += delegate
        {
            statusLabel.Text = "Collapsed";
        };

        pointerButton = new Button
        {
            Left = 304,
            Top = 74,
            Width = 128,
            Height = 30,
            Text = "Pointer Target",
            AccessibleName = "Pointer Target"
        };
        pointerButton.Click += delegate
        {
            statusLabel.Text = "PointerClicked";
        };

        keyboardBox = new TextBox
        {
            Left = 24,
            Top = 124,
            Width = 408,
            AccessibleName = "Keyboard Input"
        };
        keyboardBox.TextChanged += delegate
        {
            statusLabel.Text = "Typed:" + keyboardBox.Text;
        };
        keyboardBox.KeyDown += delegate(object sender, KeyEventArgs args)
        {
            if (args.KeyCode == Keys.Enter)
            {
                statusLabel.Text = "Key:Enter";
                args.SuppressKeyPress = true;
            }
        };

        scrollSurface = new Panel
        {
            Left = 24,
            Top = 214,
            Width = 300,
            Height = 120,
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Color.AliceBlue,
            AccessibleName = "Scroll Surface",
            TabStop = true
        };
        scrollSurface.Controls.Add(new Label
        {
            Left = 12,
            Top = 12,
            Width = 260,
            Height = 72,
            Text = "Move the pointer here and send wheel input.",
            AccessibleName = "Scroll Instructions"
        });
        scrollSurface.MouseWheel += delegate
        {
            statusLabel.Text = "Scrolled";
        };

        dragSurface = new Panel
        {
            Left = 360,
            Top = 214,
            Width = 300,
            Height = 120,
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Color.Honeydew,
            AccessibleName = "Drag Surface",
            TabStop = true
        };
        dragSurface.MouseDown += delegate(object sender, MouseEventArgs args)
        {
            dragging = args.Button == MouseButtons.Left;
        };
        dragSurface.MouseUp += delegate(object sender, MouseEventArgs args)
        {
            if (dragging)
            {
                dragging = false;
                statusLabel.Text = "Dragged";
            }
        };

        statusLabel = new Label
        {
            Left = 24,
            Top = 370,
            Width = 660,
            Height = 32,
            Text = "Idle"
        };

        Controls.Add(inputBox);
        Controls.Add(applyButton);
        Controls.Add(modePicker);
        Controls.Add(pointerButton);
        Controls.Add(keyboardBox);
        Controls.Add(scrollSurface);
        Controls.Add(dragSurface);
        Controls.Add(statusLabel);

        Shown += delegate
        {
            WriteStartupInfo();
        };
    }

    protected override void WndProc(ref Message message)
    {
        const int WmMouseWheel = 0x020A;
        if (message.Msg == WmMouseWheel && statusLabel != null)
        {
            statusLabel.Text = "Scrolled";
        }

        base.WndProc(ref message);
    }

    private void WriteStartupInfo()
    {
        var infoPath = Environment.GetEnvironmentVariable("COMPUTER_USE_SMOKE_INFO_PATH");
        if (string.IsNullOrWhiteSpace(infoPath))
        {
            return;
        }

        var payload =
            Process.GetCurrentProcess().Id + Environment.NewLine +
            Handle.ToInt64() + Environment.NewLine +
            Text + Environment.NewLine;
        File.WriteAllText(infoPath, payload);
    }

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ComputerUseP5SmokeApp());
    }
}
