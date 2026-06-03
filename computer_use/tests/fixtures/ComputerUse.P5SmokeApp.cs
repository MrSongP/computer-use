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
    private readonly Label statusLabel;

    public ComputerUseP5SmokeApp()
    {
        Text = "ComputerUse P5 Smoke";
        Width = 640;
        Height = 280;
        StartPosition = FormStartPosition.Manual;
        Location = new Point(160, 160);

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

        statusLabel = new Label
        {
            Left = 24,
            Top = 132,
            Width = 560,
            Height = 32,
            Text = "Idle"
        };

        Controls.Add(inputBox);
        Controls.Add(applyButton);
        Controls.Add(modePicker);
        Controls.Add(statusLabel);

        Shown += delegate
        {
            WriteStartupInfo();
        };
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
