@{
    Severity = @('Error', 'Warning')
    # CLI scripts use Write-Host for intentional progress and colored terminal output.
    ExcludeRules = @('PSAvoidUsingWriteHost')
}
